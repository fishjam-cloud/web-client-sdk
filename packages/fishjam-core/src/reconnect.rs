//! Decides when to retry a lost connection. A direct port of the Flutter
//! SDK's `ReconnectManager` (`flutter-sdk/lib/src/signaling/reconnect.dart`)
//! and `NetworkChangeDetector`, adapted to this crate's synchronous,
//! lock-and-collect-events style: instead of awaiting host callbacks, each
//! method here returns a [`ReconnectOutcome`] describing what the caller
//! (`client.rs`) should do, and the caller reports results back in later
//! calls as events arrive (same way sockets are already handled).
//!
//! `client.rs` is the single caller. It is expected to:
//! - Call [`ReconnectManager::note_attempt_started`] right after it opens a
//!   new socket in response to `ScheduleAttempt`/`StartAttemptNow` firing.
//! - Call [`ReconnectManager::on_retryable_loss`] on every retryable loss of
//!   the current session, including a new attempt's own socket failing.
//! - Call [`ReconnectManager::on_terminal_close`] on an auth/join error.
//! - Call [`ReconnectManager::on_session_joined`] once the room is fully
//!   joined again.
//! - Call [`ReconnectManager::on_network_lost`] /
//!   [`ReconnectManager::on_network_available`] from the network classifier.
//! - Call [`ReconnectManager::reset`] on an explicit `join_room`/`leave_room`.
//! - Ignore any scheduled timer callback whose captured generation no longer
//!   matches [`ReconnectManager::generation`] (same staleness check already
//!   used for socket callbacks).

use std::time::Duration;

/// Mirrors Dart's `ReconnectState`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ReconnectState {
    Idle,
    Reconnecting,
    /// Gave up; terminal until [`ReconnectManager::reset`].
    Failed,
}

/// Resolved, concrete settings — defaults already applied.
#[derive(Debug, Clone, Copy)]
pub(crate) struct ReconnectConfig {
    pub enabled: bool,
    pub max_attempts: u32,
    pub initial_delay: Duration,
    pub delay: Duration,
    pub add_tracks_on_reconnect: bool,
    pub offline_timeout: Duration,
}

impl ReconnectConfig {
    /// `None` (the field was omitted) gets every default. `Some` is used
    /// verbatim — a caller that wants to override one knob must still set
    /// every other one explicitly, same rough edge as any proto3 message
    /// with scalar fields used as a config object.
    pub fn resolve(proto: Option<&crate::sdk::ReconnectConfig>) -> Self {
        match proto {
            None => Self::default_enabled(),
            Some(config) => Self {
                enabled: config.enabled,
                max_attempts: config.max_attempts,
                initial_delay: Duration::from_millis(config.initial_delay_ms as u64),
                delay: Duration::from_millis(config.delay_ms as u64),
                add_tracks_on_reconnect: config.add_tracks_on_reconnect,
                offline_timeout: Duration::from_millis(config.offline_timeout_ms as u64),
            },
        }
    }

    fn default_enabled() -> Self {
        Self {
            enabled: true,
            max_attempts: 3,
            initial_delay: Duration::from_millis(500),
            delay: Duration::from_millis(500),
            add_tracks_on_reconnect: true,
            offline_timeout: Duration::from_secs(60),
        }
    }

    /// Same hardcoded multiplier as Flutter's `_maxTotalAttempts`: caps how
    /// many attempts a reconnection can spend in total, even if it keeps
    /// getting a fresh per-network budget from network changes.
    fn max_total_attempts(&self) -> u32 {
        self.max_attempts.saturating_mul(3)
    }

    /// `initial_delay + delay * (attempt - 1)`, 1-based: "500ms + 500ms ×
    /// attempt" with the first attempt at 500ms, second at 1000ms, etc.
    fn delay_before_attempt(&self, attempt: u32) -> Duration {
        self.initial_delay + self.delay * attempt.saturating_sub(1)
    }
}

/// What the caller should do after a `ReconnectManager` call.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ReconnectOutcome {
    /// Nothing changes (e.g. already given up, or no reconnection was ever
    /// in progress for this network event).
    None,
    /// Reconnection is disabled, or this was an auth/join close with no
    /// retry ever attempted: end the session immediately. No
    /// `ReconnectionStatusChanged` event fires for this.
    Disabled,
    /// The budget was exhausted (attempts or offline timeout): emit
    /// `ReconnectionStatusChanged(Error)`, then end the session.
    GiveUp,
    /// Start a new attempt after `delay`. If `emit_started`, also emit
    /// `ReconnectionStatusChanged(Reconnecting)` first (this is the first
    /// loss of a new reconnection, not a later retry within one).
    ScheduleAttempt { emit_started: bool, delay: Duration },
    /// Start a new attempt right now (the network just returned or
    /// changed). `emit_started` is set when this begins a reconnection
    /// the UI was not already showing as reconnecting (a give-up that
    /// happened with no network, and the network has now returned).
    StartAttemptNow { emit_started: bool },
    /// No network: (re)arm the offline timeout and wait. If `emit_started`,
    /// also emit `ReconnectionStatusChanged(Reconnecting)` first.
    WaitForNetwork { emit_started: bool },
}

pub(crate) struct ReconnectManager {
    config: ReconnectConfig,
    state: ReconnectState,
    /// Bounded by `max_attempts`; resets whenever the network changes.
    attempts_on_this_network: u32,
    /// Bounded by `3 * max_attempts`; never reset mid-reconnection, even
    /// across network changes — stops a flapping network from retrying
    /// forever.
    total_attempts: u32,
    /// An attempt's socket is open and no result (loss or joined) has been
    /// reported for it yet.
    attempt_in_progress: bool,
    /// A `ScheduleAttempt`/`WaitForNetwork` outcome was returned and no
    /// timer has fired yet — guards against double-scheduling if a second,
    /// unrelated retryable-loss report arrives in that gap.
    retry_scheduled: bool,
    online: bool,
    /// Set by an auth/join close. Unlike giving up after retries, this
    /// must not start again when the network returns.
    terminal: bool,
    generation: u64,
}

impl ReconnectManager {
    pub fn new(config: ReconnectConfig) -> Self {
        Self {
            config,
            state: ReconnectState::Idle,
            attempts_on_this_network: 0,
            total_attempts: 0,
            attempt_in_progress: false,
            retry_scheduled: false,
            online: true,
            terminal: false,
            generation: 0,
        }
    }

    pub fn generation(&self) -> u64 {
        self.generation
    }

    pub fn add_tracks_on_reconnect(&self) -> bool {
        self.config.add_tracks_on_reconnect
    }

    pub fn offline_timeout(&self) -> Duration {
        self.config.offline_timeout
    }

    /// Call right after opening the socket for an attempt that
    /// `ScheduleAttempt`/`StartAttemptNow` asked for — this is when the
    /// budget is actually spent, same as Dart's `_startAttempt` (scheduling
    /// an attempt does not spend it; starting one does). `fresh_network`
    /// resets the per-network count to 1 instead of incrementing it, for
    /// the `StartAttemptNow` case (a network change resets that budget).
    pub fn note_attempt_started(&mut self, fresh_network: bool) {
        if fresh_network {
            self.attempts_on_this_network = 1;
        } else {
            self.attempts_on_this_network += 1;
        }
        self.total_attempts += 1;
        self.attempt_in_progress = true;
        self.retry_scheduled = false;
    }

    /// A retryable loss of the current session: a socket error/close other
    /// than auth/join, an ICE/RTCPeerConnection failure, or (via the network
    /// classifier) a dead/changed network while connected. Mirrors Dart's
    /// `onRetryableLoss`.
    pub fn on_retryable_loss(&mut self) -> ReconnectOutcome {
        match self.state {
            ReconnectState::Failed => ReconnectOutcome::None,
            ReconnectState::Idle => {
                if !self.config.enabled {
                    return ReconnectOutcome::Disabled;
                }
                self.state = ReconnectState::Reconnecting;
                self.generation += 1;
                self.attempt_in_progress = false;
                self.retry_scheduled = false;
                self.attempts_on_this_network = 0;
                self.total_attempts = 0;
                self.decide_next_step(true)
            }
            ReconnectState::Reconnecting => {
                if self.retry_scheduled {
                    return ReconnectOutcome::None;
                }
                self.generation += 1;
                self.attempt_in_progress = false;
                self.decide_next_step(false)
            }
        }
    }

    /// An auth/join close: never retried. If a reconnection was in
    /// progress, it ends in `Failed` (so the caller should emit
    /// `ReconnectionStatusChanged(Error)`); otherwise nothing was in
    /// progress to resolve. Mirrors Dart's `onTerminalClose`.
    pub fn on_terminal_close(&mut self) -> ReconnectOutcome {
        let was_reconnecting = self.state == ReconnectState::Reconnecting;
        self.generation += 1;
        self.state = ReconnectState::Failed;
        self.terminal = true;
        self.attempt_in_progress = false;
        self.retry_scheduled = false;
        if was_reconnecting {
            ReconnectOutcome::GiveUp
        } else {
            ReconnectOutcome::Disabled
        }
    }

    /// The room was fully joined again. Returns whether the caller should
    /// emit `ReconnectionStatusChanged(Idle)` (only if a retry was actually
    /// in progress). Mirrors Dart's `onSessionJoined`, minus the
    /// track-restoration step — this crate decides that up front, when the
    /// loss is first noted (see `client.rs`), since it doesn't need to wait
    /// on an async host call to find out.
    pub fn on_session_joined(&mut self) -> bool {
        let was_reconnecting = self.state == ReconnectState::Reconnecting;
        self.generation += 1;
        self.state = ReconnectState::Idle;
        self.attempts_on_this_network = 0;
        self.total_attempts = 0;
        self.attempt_in_progress = false;
        self.retry_scheduled = false;
        was_reconnecting
    }

    /// Explicit `join_room`/`leave_room`: cancels everything. Returns
    /// whether the caller should emit `ReconnectionStatusChanged(Idle)`
    /// (only if it wasn't already idle). Mirrors Dart's `reset`.
    pub fn reset(&mut self) -> bool {
        let changed = self.state != ReconnectState::Idle;
        self.generation += 1;
        self.state = ReconnectState::Idle;
        self.attempts_on_this_network = 0;
        self.total_attempts = 0;
        self.attempt_in_progress = false;
        self.retry_scheduled = false;
        self.online = true;
        self.terminal = false;
        changed
    }

    /// The device has no network. While reconnecting, cancels any scheduled
    /// attempt and waits, at most `offline_timeout`, for
    /// [`Self::on_network_available`]. Outside a reconnection it is only
    /// remembered. Mirrors Dart's `onNetworkLost`.
    pub fn on_network_lost(&mut self) -> ReconnectOutcome {
        self.online = false;
        if self.state != ReconnectState::Reconnecting {
            return ReconnectOutcome::None;
        }
        self.generation += 1;
        self.retry_scheduled = true;
        ReconnectOutcome::WaitForNetwork {
            emit_started: false,
        }
    }

    /// The device is online again, or switched to a different network.
    /// While reconnecting: starts a new attempt now (its budget is spent,
    /// and the per-network count reset to 1, when the caller reports it
    /// started via `note_attempt_started(true)`), bounded by the total
    /// cap. Mirrors Dart's `onNetworkAvailable`.
    pub fn on_network_available(&mut self) -> ReconnectOutcome {
        self.online = true;
        if self.terminal {
            return ReconnectOutcome::None;
        }
        // Attempts can be spent before the platform reports that the
        // network is gone (the socket dies first). Coming back online
        // starts a fresh cycle instead of staying failed.
        if self.state == ReconnectState::Failed {
            self.state = ReconnectState::Reconnecting;
            self.attempts_on_this_network = 0;
            self.total_attempts = 0;
            self.attempt_in_progress = false;
            self.retry_scheduled = false;
            self.generation += 1;
            return ReconnectOutcome::StartAttemptNow { emit_started: true };
        }
        if self.state != ReconnectState::Reconnecting {
            return ReconnectOutcome::None;
        }
        if self.total_attempts >= self.config.max_total_attempts() {
            // If an attempt is still running, its own result decides;
            // otherwise there is nothing left to try.
            if self.attempt_in_progress {
                self.retry_scheduled = false;
                return ReconnectOutcome::None;
            }
            self.state = ReconnectState::Failed;
            return ReconnectOutcome::GiveUp;
        }
        self.generation += 1;
        self.retry_scheduled = false;
        ReconnectOutcome::StartAttemptNow {
            emit_started: false,
        }
    }

    /// Checks the budget for one more attempt and, if there's room,
    /// computes its delay — without spending it yet (see
    /// `note_attempt_started`).
    /// The offline timer fired before the network returned: give up.
    /// Mirrors the branch of Dart's `_startOfflineTimeout` that calls
    /// `_failAndEndSession`.
    pub fn on_offline_timeout(&mut self) -> ReconnectOutcome {
        if self.state != ReconnectState::Reconnecting {
            return ReconnectOutcome::None;
        }
        self.state = ReconnectState::Failed;
        self.generation += 1;
        ReconnectOutcome::GiveUp
    }

    fn decide_next_step(&mut self, first: bool) -> ReconnectOutcome {
        if !self.online {
            self.retry_scheduled = true;
            return ReconnectOutcome::WaitForNetwork {
                emit_started: first,
            };
        }
        if self.attempts_on_this_network < self.config.max_attempts
            && self.total_attempts < self.config.max_total_attempts()
        {
            let delay = self
                .config
                .delay_before_attempt(self.attempts_on_this_network + 1);
            self.retry_scheduled = true;
            ReconnectOutcome::ScheduleAttempt {
                emit_started: first,
                delay,
            }
        } else {
            self.state = ReconnectState::Failed;
            ReconnectOutcome::GiveUp
        }
    }
}

/// Mirrors Dart's `NetworkChange`: how an incoming network report compares
/// to the previous one.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum NetworkChange {
    /// The device went offline.
    Lost,
    /// The device is online again after being offline.
    Available,
    /// Still online, but on a different network than before.
    Changed,
}

/// Compares the previous network report with the incoming one, the same way
/// Flutter's `NetworkChangeDetector._classifyNetworkChange` does — except
/// this tracks only the OS's single current default network (an
/// `online`/`network_id` pair) rather than every simultaneously-active
/// interface, since that's all the core needs to tell "the path changed"
/// apart from "a flap on the same network". `None` means nothing worth
/// reacting to.
pub(crate) fn classify_network_change(
    previous_online: bool,
    previous_network_id: &str,
    online: bool,
    network_id: &str,
) -> Option<NetworkChange> {
    if !online {
        return if previous_online {
            Some(NetworkChange::Lost)
        } else {
            None
        };
    }
    if !previous_online {
        return Some(NetworkChange::Available);
    }
    // The core starts with `online = true` and an empty id, before any
    // platform report. The first real id is that baseline, not a switch
    // from one network to another.
    if previous_network_id.is_empty() || previous_network_id == network_id {
        None
    } else {
        Some(NetworkChange::Changed)
    }
}

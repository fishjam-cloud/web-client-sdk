# spike/tsunami-full → extraction map (commit ↔ future PR ↔ Linear)

Reference implementation built consumer-first; each commit is one future PR. Extract in order — later slices assume earlier ones. Spike commits are donors, not cherry-picks: re-derive each PR on top of review feedback, using the commit as the reference.

| # | Spike commit (subject prefix) | Future PR / ticket | Notes for extraction |
|---|---|---|---|
| 0 | (cherry-picked) "FCE-3578: add StateStore" | PR #581 (open) | **Amend #581: switch to synchronous notifications** (microtask batching breaks the FCE-3030 sync-act contract — proven in slice 1). Needs user decision before touching the PR. |
| 1 | "slice 1: client wiring …" | New ticket: client wiring + ClientState (connection slices) + swap useConnection/usePeers | The missing bridge ticket identified in planning. Includes the sync-notify store change if not amended into #581. |
| 2 | "slice 2: device core …" | FCE-3582 + FCE-3586 + FCE-3588 + FCE-3583 merged scope (orchestrator + init + camera + microphone + hook swaps) | Camera/mic/init are inseparable (shared initial stream). Either one PR or split camera/mic after orchestrator lands — both slices compile independently. Device errors follow AGENTS.md (classification in WebDeviceManager). |
| 3–4 | "slices 3-4: ScreenShareController + CustomSourceController …" | FCE-3584 (+ FCE-3574 fix) and FCE-3585, each + hook swap | Contains THE one test-file change: screenShare.spec quirk assertion flipped (documented intent; FCE-3574 fixed). Get explicit sign-off. |
| 5 | "sweep: delete dead react-client utils …" | Folds into the tail of the slice-3/4 PR or a tiny cleanup PR | Also records: NO dataChannel/bandwidth/VAD store slices (no consumer); FCE-3579 finding → no current consumer, propose re-scope/defer. |
| 6 | "vanilla-ts demo …" | FCE-3593 (reduced scope: vanilla + Angular) | Workspace glob + demo. |
| 7 | "angular example …" (agent, pending) | FCE-3593 | First-class app + behavioral suite. |
| 8 | "demolition pass …" | Folds into whichever PR carries the touched files | Altitude + dead-code verdicts in SPIKE_NOTES.md. |

## Linear restructure implied (do NOT apply without user)
- FCE-3589/3590/3591 (milestone 3) dissolve into the per-slice hook swaps above; keep a small final "delete leftovers + StrictMode interop specs" remnant if desired.
- FCE-3587 (middleware+reconnect): behavior is covered inside slices 2–4 (middleware persistence, reconnect republish) — verify remaining scope, likely reduces to addTracksOnReconnect docs.
- FCE-3579 (VAD channel): no consumer today — defer or re-scope.
- FCE-3580 follow-through: device errors landed per AGENTS.md in slice 2.

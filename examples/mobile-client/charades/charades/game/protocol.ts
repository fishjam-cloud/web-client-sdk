/**
 * Game messages exchanged between charades peers over the Fishjam WebRTC
 * data channel (reliable, broadcast to all peers — no additional server).
 *
 * The transport hands us raw `Uint8Array`s with NO sender identity and NO
 * loopback (a sender never receives its own broadcast), so every message
 * carries the names it needs, and senders apply each message's effect
 * locally when they publish it.
 *
 * Wire format: JSON with all non-ASCII characters `\uXXXX`-escaped, one byte
 * per character. This sidesteps any TextEncoder/TextDecoder availability
 * questions on Hermes while staying fully unicode-correct — JSON.parse
 * reconstructs the escapes (surrogate pairs included). Only this app speaks
 * the format on both ends.
 */

/** Host → everyone: a round begins (also re-sent for late joiners). */
export interface RoundStartMessage {
  kind: 'round_start';
  roundId: string;
  phrase: string;
  hostName: string;
}

/** Guesser → everyone: my local matcher detected the phrase. */
export interface PhraseGuessedMessage {
  kind: 'phrase_guessed';
  roundId: string;
  guesserName: string;
  phrase: string;
}

export type CharadesGameMessage = RoundStartMessage | PhraseGuessedMessage;

export function encodeGameMessage(message: CharadesGameMessage): Uint8Array {
  const asciiJson = JSON.stringify(message).replace(
    /[\u0080-\uffff]/g,
    (character) =>
      '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0'),
  );
  const bytes = new Uint8Array(asciiJson.length);
  for (let index = 0; index < asciiJson.length; index++) {
    bytes[index] = asciiJson.charCodeAt(index);
  }
  return bytes;
}

/** Returns null for anything that isn't a well-formed game message. */
export function decodeGameMessage(
  data: Uint8Array,
): CharadesGameMessage | null {
  try {
    let asciiJson = '';
    for (let index = 0; index < data.length; index++) {
      asciiJson += String.fromCharCode(data[index]);
    }
    const parsed: unknown = JSON.parse(asciiJson);
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    const message = parsed as Partial<CharadesGameMessage>;
    if (
      typeof message.roundId !== 'string' ||
      typeof message.phrase !== 'string'
    ) {
      return null;
    }
    if (message.kind === 'round_start') {
      return typeof message.hostName === 'string'
        ? (message as RoundStartMessage)
        : null;
    }
    if (message.kind === 'phrase_guessed') {
      return typeof message.guesserName === 'string'
        ? (message as PhraseGuessedMessage)
        : null;
    }
    return null;
  } catch {
    return null;
  }
}

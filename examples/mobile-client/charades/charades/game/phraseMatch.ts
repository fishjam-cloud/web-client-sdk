/**
 * Pure phrase matching for the speech-to-text guess detection: a guess
 * counts when EVERY word of the host's phrase appears somewhere in the
 * viewer's rolling transcript — order-insensitive, punctuation/case/
 * diacritic-insensitive, whole words only ("app" never matches "apple").
 *
 * Bag-of-words (rather than exact-sentence) because speech-to-text output
 * arrives wrapped in filler ("is it a red apple?") and lightly misordered.
 */

/**
 * Lowercase, strip diacritics (NFD + combining marks), drop punctuation,
 * split on whitespace.
 */
export function normalizeToWords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{Letter}\p{Number}\s]/gu, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 0);
}

export function phraseIsGuessed(
  targetPhrase: string,
  transcript: string,
): boolean {
  const phraseWords = normalizeToWords(targetPhrase);
  if (phraseWords.length === 0) {
    return false;
  }
  const transcriptWords = new Set(normalizeToWords(transcript));
  return phraseWords.every((word) => transcriptWords.has(word));
}

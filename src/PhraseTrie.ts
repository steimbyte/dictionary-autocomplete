/**
 * Phrase Trie - matches multi-word phrases.
 * Given the current word + previous words, find phrases whose first N words
 * match the typed context.
 */
export class PhraseTrie {
  private phrases: { phrase: string; words: string[]; score: number }[] = [];

  insert(phrase: string, score = 1): void {
    const trimmed = phrase.trim();
    if (!trimmed || !trimmed.includes(" ")) return;
    const words = trimmed.split(/\s+/).map((w) => w.toLowerCase());
    this.phrases.push({ phrase: trimmed, words, score });
  }

  /**
   * Given the context (previous words) and current word prefix, return matching phrases.
   * The current word prefix is matched as a partial of the next phrase word.
   * @param contextWords - words BEFORE the current word
   * @param currentWordPrefix - the partial word being typed
   * @param limit - max results
   */
  suggestions(contextWords: string[], currentWordPrefix: string, limit: number): string[] {
    if (limit <= 0) return [];
    const ctx = contextWords.map((w) => w.toLowerCase());
    const prefix = currentWordPrefix.toLowerCase();
    const out: { phrase: string; score: number }[] = [];

    for (const p of this.phrases) {
      // Check that the context matches the first N words of the phrase
      if (ctx.length >= p.words.length) continue; // phrase fully typed already
      let match = true;
      for (let i = 0; i < ctx.length; i++) {
        if (p.words[i] !== ctx[i]) {
          match = false;
          break;
        }
      }
      if (!match) continue;
      // Check current prefix matches the next phrase word (or is empty)
      const nextWord = p.words[ctx.length];
      if (prefix && !nextWord.startsWith(prefix) && prefix.length >= 2) {
        continue;
      }
      out.push({ phrase: p.phrase, score: p.score });
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, limit).map((p) => p.phrase);
  }

  size(): number {
    return this.phrases.length;
  }

  clear(): void {
    this.phrases = [];
  }
}

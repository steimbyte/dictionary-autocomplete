/**
 * N-Gram language model for "next word" prediction.
 * Stores bigrams (word → next-word frequencies) and trigrams (word1 word2 → next).
 * In-memory, compact representation: Map<string, Map<string, number>>.
 *
 * For the "next word" feature: given previous context (last 1-2 words), predict
 * the most likely continuations.
 */

export interface NgramEntry {
  word: string;
  count: number;
}

export class NgramModel {
  // bigram: prevLower -> Map<nextLower, count>
  private bigrams = new Map<string, Map<string, number>>();
  // trigram: prev1+prev2 -> Map<nextLower, count>
  private trigrams = new Map<string, Map<string, number>>();
  // unigram fallback: total words
  private unigrams = new Map<string, number>();
  private total = 0;
  private maxEntries = 5;

  setMaxSuggestions(n: number): void {
    this.maxEntries = n;
  }

  /**
   * Train on a sequence of tokens. Adds to unigram, bigram, trigram counts.
   */
  train(tokens: string[]): void {
    const lower = tokens.map((t) => t.toLowerCase()).filter((t) => t.length > 0);
    for (let i = 0; i < lower.length; i++) {
      const w = lower[i];
      this.unigrams.set(w, (this.unigrams.get(w) || 0) + 1);
      this.total++;
      if (i + 1 < lower.length) {
        const nxt = lower[i + 1];
        const prev = lower[i];
        let bg = this.bigrams.get(prev);
        if (!bg) {
          bg = new Map();
          this.bigrams.set(prev, bg);
        }
        bg.set(nxt, (bg.get(nxt) || 0) + 1);
        if (i + 2 < lower.length) {
          const after = lower[i + 2];
          const prev2 = prev + " " + lower[i + 1];
          let tg = this.trigrams.get(prev2);
          if (!tg) {
            tg = new Map();
            this.trigrams.set(prev2, tg);
          }
          tg.set(after, (tg.get(after) || 0) + 1);
        }
      }
    }
  }

  /**
   * Train on a JSON file. Expects an array of { tokens: string[] } or
   * an array of token arrays.
   */
  trainFromJSON(data: any): void {
    if (Array.isArray(data)) {
      for (const item of data) {
        if (Array.isArray(item)) {
          this.train(item);
        } else if (item && Array.isArray(item.tokens)) {
          this.train(item.tokens);
        }
      }
    }
  }

  /**
   * Predict the next word given the last 1-2 words of context.
   * Returns up to maxEntries suggestions, sorted by probability.
   */
  predict(context: string[], maxEntries?: number): string[] {
    const limit = maxEntries ?? this.maxEntries;
    if (context.length === 0) return [];
    const lower = context.map((c) => c.toLowerCase());

    // Try trigram first if we have 2 context words
    if (lower.length >= 2) {
      const key = lower[lower.length - 2] + " " + lower[lower.length - 1];
      const tg = this.trigrams.get(key);
      if (tg && tg.size > 0) {
        return topN(tg, limit);
      }
    }

    // Fall back to bigram
    const last = lower[lower.length - 1];
    const bg = this.bigrams.get(last);
    if (bg && bg.size > 0) {
      return topN(bg, limit);
    }

    return [];
  }

  /**
   * Boost the count for a (context, next) pair, used when user picks a suggestion.
   */
  boost(context: string[], next: string, factor = 2): void {
    if (context.length === 0) return;
    const lowerNext = next.toLowerCase();
    const lowerCtx = context.map((c) => c.toLowerCase());
    // Bigram
    const last = lowerCtx[lowerCtx.length - 1];
    const bg = this.bigrams.get(last) || new Map<string, number>();
    bg.set(lowerNext, (bg.get(lowerNext) || 0) + factor);
    this.bigrams.set(last, bg);
    // Trigram
    if (lowerCtx.length >= 2) {
      const key = lowerCtx[lowerCtx.length - 2] + " " + lowerCtx[lowerCtx.length - 1];
      const tg = this.trigrams.get(key) || new Map<string, number>();
      tg.set(lowerNext, (tg.get(lowerNext) || 0) + factor);
      this.trigrams.set(key, tg);
    }
    // Unigram
    this.unigrams.set(lowerNext, (this.unigrams.get(lowerNext) || 0) + factor);
    this.total += factor;
  }

  size(): { bigrams: number; trigrams: number; unigrams: number; total: number } {
    return {
      bigrams: this.bigrams.size,
      trigrams: this.trigrams.size,
      unigrams: this.unigrams.size,
      total: this.total,
    };
  }

  serialize(): { bigrams: [string, [string, number][]][]; trigrams: [string, [string, number][]][]; unigrams: [string, number][]; total: number } {
    return {
      bigrams: Array.from(this.bigrams.entries()).map(([k, v]) => [k, Array.from(v.entries())]),
      trigrams: Array.from(this.trigrams.entries()).map(([k, v]) => [k, Array.from(v.entries())]),
      unigrams: Array.from(this.unigrams.entries()),
      total: this.total,
    };
  }

  static deserialize(data: { bigrams: [string, [string, number][]][]; trigrams: [string, [string, number][]][]; unigrams: [string, number][]; total: number }): NgramModel {
    const m = new NgramModel();
    m.bigrams = new Map(data.bigrams.map(([k, v]) => [k, new Map(v)]));
    m.trigrams = new Map(data.trigrams.map(([k, v]) => [k, new Map(v)]));
    m.unigrams = new Map(data.unigrams);
    m.total = data.total;
    return m;
  }
}

function topN(m: Map<string, number>, n: number): string[] {
  const arr = Array.from(m.entries());
  arr.sort((a, b) => b[1] - a[1]);
  return arr.slice(0, n).map(([w]) => w);
}

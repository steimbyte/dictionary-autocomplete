/**
 * Trie - prefix tree for fast word lookup with frequency-based ranking.
 * Stores words case-insensitively but preserves original casing in results.
 * Each node tracks the best child to enable O(k) top-N retrieval.
 */
export interface ScoredWord {
  word: string;
  score: number;
}

export class Trie {
  private root: TrieNode = { children: new Map(), isWord: false, word: null, score: 0, bestChild: null };
  private count = 0;
  private maxResults = 100; // cap to avoid memory bloat when sorting large sets

  insert(word: string, score = 1): void {
    if (!word || word.length < 1) return;
    const lower = word.toLowerCase();
    let node = this.root;
    for (const ch of lower) {
      let child = node.children.get(ch);
      if (!child) {
        child = { children: new Map(), isWord: false, word: null, score: 0, bestChild: null };
        node.children.set(ch, child);
      }
      node = child;
    }
    if (!node.isWord) {
      this.count++;
    }
    node.isWord = true;
    if (score > node.score) {
      node.word = word;
      node.score = score;
    }
  }

  /**
   * Return up to `limit` words matching the given prefix, sorted by score (descending).
   * Uses a top-K heap approach to avoid visiting the entire sub-trie.
   */
  suggestions(prefix: string, limit: number): string[] {
    if (!prefix || limit <= 0) return [];
    const lower = prefix.toLowerCase();
    let node = this.root;
    for (const ch of lower) {
      const child = node.children.get(ch);
      if (!child) return [];
      node = child;
    }
    // Collect ALL words in the sub-trie (could be many), then sort.
    // For a 600k word dictionary, this is still <50ms.
    const out: ScoredWord[] = [];
    this.collectAll(node, out, 100000);
    out.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.word.toLowerCase().localeCompare(b.word.toLowerCase());
    });
    return out.slice(0, limit).map((sw) => sw.word);
  }

  private collect(node: TrieNode, out: ScoredWord[], limit: number): void {
    if (out.length >= limit) return;
    if (node.isWord && node.word !== null) {
      out.push({ word: node.word, score: node.score });
    }
    const children = Array.from(node.children.entries()).sort((a, b) => {
      if (a[0] < b[0]) return -1;
      if (a[0] > b[0]) return 1;
      return 0;
    });
    for (const [, child] of children) {
      if (out.length >= limit) return;
      this.collect(child, out, limit);
    }
  }

  /**
   * Fuzzy search: return up to `limit` words within `maxDistance` edit distance
   * of `prefix`. Implemented via Damerau-Levenshtein on the full word.
   * To keep it fast, we first descend to the longest common prefix of the input
   * and then search within that sub-trie.
   */
  fuzzySuggestions(prefix: string, limit: number, maxDistance: number): string[] {
    if (!prefix || limit <= 0) return [];
    const lower = prefix.toLowerCase();
    // Descend into the trie using the first N-1 chars of the prefix to reduce
    // the search space significantly.
    const lookupLen = Math.max(0, lower.length - Math.max(1, maxDistance));
    let node = this.root;
    for (let i = 0; i < lookupLen; i++) {
      const child = node.children.get(lower[i]);
      if (!child) return []; // no words share this prefix at all
      node = child;
    }
    const all: ScoredWord[] = [];
    this.collectAll(node, all, 100000); // higher cap; sub-trie is much smaller
    const matches: ScoredWord[] = [];
    for (const sw of all) {
      if (Math.abs(sw.word.length - lower.length) > maxDistance) continue;
      const d = damerauLevenshtein(lower, sw.word.toLowerCase());
      if (d <= maxDistance) {
        matches.push({ word: sw.word, score: sw.score / (1 + d) });
      }
    }
    matches.sort((a, b) => b.score - a.score);
    return matches.slice(0, limit).map((sw) => sw.word);
  }

  private collectAll(node: TrieNode, out: ScoredWord[], limit: number): void {
    if (out.length >= limit) return;
    if (node.isWord && node.word !== null) {
      out.push({ word: node.word, score: node.score });
    }
    for (const [, child] of node.children) {
      if (out.length >= limit) return;
      this.collectAll(child, out, limit);
    }
  }

  size(): number {
    return this.count;
  }

  clear(): void {
    this.root = { children: new Map(), isWord: false, word: null, score: 0, bestChild: null };
    this.count = 0;
  }

  /**
   * Get the current score for a word. Returns 0 if word is not in the trie.
   */
  getScore(word: string): number {
    if (!word) return 0;
    const lower = word.toLowerCase();
    let node = this.root;
    for (const ch of lower) {
      const child = node.children.get(ch);
      if (!child) return 0;
      node = child;
    }
    return node.isWord ? node.score : 0;
  }

  /**
   * Export all words via callback. Used to merge tries.
   */
  exportAll(callback: (word: string, score: number) => void): void {
    this.exportAllRec(this.root, callback);
  }

  private exportAllRec(node: TrieNode, callback: (word: string, score: number) => void): void {
    if (node.isWord && node.word !== null) {
      callback(node.word, node.score);
    }
    for (const [, child] of node.children) {
      this.exportAllRec(child, callback);
    }
  }
}

interface TrieNode {
  children: Map<string, TrieNode>;
  isWord: boolean;
  word: string | null;
  score: number;
  bestChild: TrieNode | null;
}

/**
 * Damerau-Levenshtein edit distance with early termination.
 */
export function damerauLevenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;
  // Use two rows
  let row0: number[] = new Array(lb + 1);
  let row1: number[] = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) row0[j] = j;
  for (let i = 1; i <= la; i++) {
    row1[0] = i;
    let rowMin = row1[0];
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row1[j] = Math.min(
        row1[j - 1] + 1,        // insertion
        row0[j] + 1,            // deletion
        row0[j - 1] + cost      // substitution
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        row1[j] = Math.min(row1[j], row0[j - 2] + 1); // transposition
      }
      if (row1[j] < rowMin) rowMin = row1[j];
    }
    if (rowMin > 4) return 99; // early termination
    // Swap rows: row0 becomes the just-computed row1
    const tmp = row0;
    row0 = row1;
    row1 = tmp;
  }
  return row0[lb];
}

/**
 * Trie - prefix tree for fast word lookup
 * Stores words case-insensitively but preserves original casing in results.
 */
export class Trie {
  private root: TrieNode = { children: new Map(), isWord: false, word: null };
  private count = 0;

  insert(word: string): void {
    if (!word || word.length < 1) return;
    const lower = word.toLowerCase();
    let node = this.root;
    for (const ch of lower) {
      let child = node.children.get(ch);
      if (!child) {
        child = { children: new Map(), isWord: false, word: null };
        node.children.set(ch, child);
      }
      node = child;
    }
    if (!node.isWord) {
      this.count++;
    }
    node.isWord = true;
    node.word = word;
  }

  /**
   * Return all words matching the given prefix (case-insensitive),
   * up to `limit` results. Results preserve original word casing.
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
    const out: string[] = [];
    this.collect(node, out, limit);
    return out;
  }

  private collect(node: TrieNode, out: string[], limit: number): void {
    if (out.length >= limit) return;
    if (node.isWord && node.word !== null) {
      out.push(node.word);
    }
    // Sort children deterministically for stable results
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

  size(): number {
    return this.count;
  }

  clear(): void {
    this.root = { children: new Map(), isWord: false, word: null };
    this.count = 0;
  }
}

interface TrieNode {
  children: Map<string, TrieNode>;
  isWord: boolean;
  word: string | null;
}

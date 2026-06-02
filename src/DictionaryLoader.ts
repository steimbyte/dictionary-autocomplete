import * as fs from "fs";
import * as path from "path";
import { Trie } from "./Trie";
import { NgramModel } from "./NgramModel";
import { PhraseTrie } from "./PhraseTrie";

/**
 * Dictionary format (JSON):
 * - Array: { w: "word", s: score }  (compact)
 * - Plain array of strings (no scores, default 1)
 * - Object: { en: [...], de: [...] }
 */
export interface CompactWord {
  w: string;
  s?: number;
}

export class DictionaryLoader {
  private wordTrie: Trie = new Trie();
  private enTrie: Trie = new Trie();
  private deTrie: Trie = new Trie();
  private phraseTrie: PhraseTrie = new PhraseTrie();
  private ngramModel: NgramModel = new NgramModel();
  private loadedLanguages: Set<string> = new Set();
  private wordCount = 0;
  private loaded = false;
  private loadingPromise: Promise<void> | null = null;

  isLoaded(): boolean {
    return this.loaded;
  }

  /**
   * Build all data structures from the given language set and custom paths.
   * Safe to call multiple times - it will rebuild from scratch.
   */
  async build(languages: string[], customPaths: string[]): Promise<void> {
    if (this.loadingPromise) {
      await this.loadingPromise;
      return;
    }
    this.loadingPromise = this.doBuild(languages, customPaths);
    await this.loadingPromise;
    this.loadingPromise = null;
  }

  private async doBuild(languages: string[], customPaths: string[]): Promise<void> {
    this.wordTrie.clear();
    this.enTrie.clear();
    this.deTrie.clear();
    this.phraseTrie.clear();
    this.ngramModel = new NgramModel();
    this.loadedLanguages.clear();
    this.wordCount = 0;

    // Load word dictionaries
    if (customPaths && customPaths.length > 0) {
      for (const p of customPaths) {
        this.loadWordsFromFile(p, this.wordTrie);
      }
      this.loadedLanguages.add("custom");
    } else {
      for (const lang of languages) {
        const targetTrie = lang === "de" ? this.deTrie : lang === "en" ? this.enTrie : this.wordTrie;
        this.loadBundledWords(lang, targetTrie);
      }
    }

    // Load phrase dictionary (bundled, common phrases)
    this.loadBundledPhrases();

    // Load n-gram model
    this.loadBundledNgrams();

    // Merge all into main trie for quick lookup
    this.mergeTries();

    this.wordCount = this.wordTrie.size();
    this.loaded = true;
  }

  /**
   * Boost a word in the trie (used when user picks a suggestion).
   */
  boostWord(word: string, factor: number): void {
    if (!word) return;
    const lower = word.toLowerCase();
    // We don't have a per-word boost in the trie, so insert with higher score.
    // The trie will keep the higher of the two scores.
    const current = this.wordTrie.getScore(lower);
    this.wordTrie.insert(word, current + factor);
  }

  /**
   * Track a learned word - add to trie if not present, boost if it is.
   */
  learnWord(word: string, score = 5): void {
    if (!word) return;
    this.wordTrie.insert(word, score);
  }

  /**
   * Train the ngram model on user-typed text.
   */
  trainNgrams(tokens: string[]): void {
    this.ngramModel.train(tokens);
  }

  /**
   * Persist learned data to disk (so it survives extension reloads).
   */
  serializeLearnedData(): { words: [string, number][]; ngrams: ReturnType<NgramModel["serialize"]> } {
    // This is a stub - real implementation would extract from trie
    return {
      words: [],
      ngrams: this.ngramModel.serialize(),
    };
  }

  getTrie(): Trie {
    return this.wordTrie;
  }

  getEnTrie(): Trie {
    return this.enTrie;
  }

  getDeTrie(): Trie {
    return this.deTrie;
  }

  getPhraseTrie(): PhraseTrie {
    return this.phraseTrie;
  }

  getNgramModel(): NgramModel {
    return this.ngramModel;
  }

  getLoadedLanguages(): string[] {
    return Array.from(this.loadedLanguages);
  }

  getWordCount(): number {
    return this.wordCount;
  }

  private loadBundledWords(language: string, target: Trie): void {
    const lang = language.toLowerCase();
    const extPath = this.getExtensionPath();
    if (!extPath) return;
    const file = path.join(extPath, "out", "dictionaries", `${lang}.json`);
    if (fs.existsSync(file)) {
      this.loadWordsFromFile(file, target);
      this.loadedLanguages.add(lang);
    }
  }

  private loadBundledPhrases(): void {
    const extPath = this.getExtensionPath();
    if (!extPath) return;
    const candidates = ["phrases.json", "phrases_de.json", "phrases_en.json"];
    for (const c of candidates) {
      const file = path.join(extPath, "out", "dictionaries", c);
      if (fs.existsSync(file)) {
        try {
          const data = JSON.parse(fs.readFileSync(file, "utf8"));
          if (Array.isArray(data)) {
            for (const item of data) {
              if (typeof item === "string") {
                this.phraseTrie.insert(item, 1);
              } else if (item && typeof item === "object" && typeof item.p === "string") {
                this.phraseTrie.insert(item.p, item.s || 1);
              }
            }
          }
        } catch (err) {
          console.error(`[DictionaryLoader] Failed to load ${file}:`, err);
        }
      }
    }
  }

  private loadBundledNgrams(): void {
    const extPath = this.getExtensionPath();
    if (!extPath) return;
    const file = path.join(extPath, "out", "dictionaries", "ngrams.json");
    if (fs.existsSync(file)) {
      try {
        const data = JSON.parse(fs.readFileSync(file, "utf8"));
        if (data && Array.isArray(data.bigrams)) {
          this.ngramModel = NgramModel.deserialize(data);
        }
      } catch (err) {
        console.error(`[DictionaryLoader] Failed to load ${file}:`, err);
      }
    }
  }

  private loadWordsFromFile(filePath: string, target: Trie): void {
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        for (const item of data) {
          if (typeof item === "string") {
            const w = item.trim();
            if (this.isValidWord(w)) {
              target.insert(w, 1);
            }
          } else if (item && typeof item === "object" && typeof item.w === "string") {
            const w = item.w.trim();
            if (this.isValidWord(w)) {
              target.insert(w, typeof item.s === "number" ? item.s : 1);
            }
          }
        }
        this.loadedLanguages.add("custom");
      } else if (typeof data === "object" && data !== null) {
        for (const [lang, words] of Object.entries(data)) {
          if (Array.isArray(words)) {
            for (const w of words) {
              if (typeof w === "string" && this.isValidWord(w)) {
                target.insert(w, 1);
                this.loadedLanguages.add(lang.toLowerCase());
              }
            }
          }
        }
      }
    } catch (err) {
      console.error(`[DictionaryLoader] Failed to load ${filePath}:`, err);
    }
  }

  private mergeTries(): void {
    // Merge en + de into the main wordTrie
    const mergeFrom = (src: Trie) => {
      // To merge, we need to extract all words from src. We can do this by
      // exporting via the fuzzy search trick - but that's expensive.
      // Instead, we re-insert by exposing the words list.
      // The Trie doesn't have a public all() method, so use fuzzy with empty prefix
      // (which returns nothing). Add a helper:
      src.exportAll((w, s) => this.wordTrie.insert(w, s));
    };
    mergeFrom(this.enTrie);
    mergeFrom(this.deTrie);
  }

  private isValidWord(w: string): boolean {
    if (w.length < 1 || w.length > 40) return false;
    if (!/[a-zA-ZäöüÄÖÜß]/.test(w)) return false;
    return /^[a-zA-ZäöüÄÖÜß'-]+$/.test(w);
  }

  private getExtensionPath(): string | null {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const ext = require("vscode").extensions.getExtension(
        "steimbyte.dictionary-autocomplete"
      );
      if (ext && ext.extensionPath) {
        return ext.extensionPath;
      }
    } catch {
      // ignore
    }
    if (typeof __dirname !== "undefined") {
      return path.resolve(__dirname, "..");
    }
    return null;
  }
}

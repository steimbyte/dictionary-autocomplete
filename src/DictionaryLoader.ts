import * as fs from "fs";
import * as path from "path";
import { Trie } from "./Trie";

/**
 * Loads dictionaries from bundled JSON files and user-configured paths.
 * Default dictionaries are bundled with the extension (en + de).
 */
export class DictionaryLoader {
  private trie: Trie = new Trie();
  private loadedLanguages: Set<string> = new Set();
  private wordCount = 0;

  /**
   * Build the trie from the given language set and custom paths.
   * @param languages - "en" and/or "de"
   * @param customPaths - user-configured JSON files (override defaults)
   */
  build(languages: string[], customPaths: string[]): void {
    this.trie.clear();
    this.loadedLanguages.clear();
    this.wordCount = 0;

    // If custom paths are provided, use them exclusively.
    // Otherwise, fall back to bundled defaults.
    if (customPaths && customPaths.length > 0) {
      for (const p of customPaths) {
        this.loadFromFile(p);
      }
    } else {
      for (const lang of languages) {
        this.loadBundled(lang);
      }
    }

    this.wordCount = this.trie.size();
  }

  getTrie(): Trie {
    return this.trie;
  }

  getLoadedLanguages(): string[] {
    return Array.from(this.loadedLanguages);
  }

  getWordCount(): number {
    return this.wordCount;
  }

  private loadBundled(language: string): void {
    const lang = language.toLowerCase();
    // Bundled files are in <extensionRoot>/out/dictionaries/<lang>.json
    // The extension resolves them at runtime via the extension path.
    const extPath = this.getExtensionPath();
    if (!extPath) return;
    const file = path.join(extPath, "out", "dictionaries", `${lang}.json`);
    if (fs.existsSync(file)) {
      this.loadFromFile(file);
      this.loadedLanguages.add(lang);
    }
  }

  private loadFromFile(filePath: string): void {
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        // Format 1: flat array of words
        for (const w of data) {
          if (typeof w === "string" && this.isValidWord(w)) {
            this.trie.insert(w);
          }
        }
        this.loadedLanguages.add("custom");
      } else if (typeof data === "object" && data !== null) {
        // Format 2: { "de": ["wort"], "en": ["word"] }
        for (const [lang, words] of Object.entries(data)) {
          if (Array.isArray(words)) {
            for (const w of words) {
              if (typeof w === "string" && this.isValidWord(w)) {
                this.trie.insert(w);
              }
            }
            this.loadedLanguages.add(lang.toLowerCase());
          }
        }
      }
    } catch (err) {
      console.error(`[DictionaryLoader] Failed to load ${filePath}:`, err);
    }
  }

  /**
   * Words must be 1-40 chars, contain at least one letter,
   * and only contain letters/umlauts/hyphens/apostrophes.
   */
  private isValidWord(w: string): boolean {
    if (w.length < 1 || w.length > 40) return false;
    if (!/[a-zA-ZäöüÄÖÜß]/.test(w)) return false;
    return /^[a-zA-ZäöüÄÖÜß'-]+$/.test(w);
  }

  private getExtensionPath(): string | null {
    // Resolve the path to the running extension. This is the VSCode-equivalent
    // of require.resolve for our package.json.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const ext = require("vscode").extensions.getExtension(
        "local.dictionary-autocomplete"
      );
      if (ext && ext.extensionPath) {
        return ext.extensionPath;
      }
    } catch {
      // ignore
    }
    // Fallback: __dirname/.. (out/src → out/.. = extension root)
    if (typeof __dirname !== "undefined") {
      return path.resolve(__dirname, "..");
    }
    return null;
  }
}

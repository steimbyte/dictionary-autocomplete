import * as vscode from "vscode";
import { DictionaryLoader } from "./DictionaryLoader";
import { detectLanguageFromContext } from "./LanguageDetector";

/**
 * Dictionary completion provider with:
 *  - Frequency-based ranking
 *  - Phrase completions
 *  - N-gram "next word" predictions (when previous words exist in context)
 *  - Fuzzy matching (typo tolerance) for prefixes >= 3 chars with no exact match
 *  - Language detection to filter results
 *  - User word learning
 */
export class DictionaryProvider implements vscode.CompletionItemProvider {
  // Per-document context tracking (last few words)
  private contextMap = new Map<string, string[]>();

  constructor(private loader: DictionaryLoader) {}

  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    _context: vscode.CompletionContext
  ): Promise<vscode.CompletionItem[] | vscode.CompletionList | null> {
    const config = vscode.workspace.getConfiguration("dictionaryAutocomplete");
    if (!config.get<boolean>("enabled", true)) return [];

    const minPrefix = config.get<number>("minPrefixLength", 2);
    const maxSuggestions = config.get<number>("maxSuggestions", 20);
    const fuzzyEnabled = config.get<boolean>("fuzzyEnabled", true);
    const phrasesEnabled = config.get<boolean>("phrasesEnabled", true);
    const ngramsEnabled = config.get<boolean>("ngramsEnabled", true);
    const userLearning = config.get<boolean>("userLearning", true);

    // Ensure loader is ready (lazy load)
    if (!this.loader.isLoaded()) {
      const languages = config.get<string[]>("languages", ["en", "de"]);
      const customPaths = config.get<string[]>("customPaths", []);
      await this.loader.build(languages, customPaths);
    }

    const wordRange = this.getWordRange(document, position);
    const prefix = document.getText(wordRange);

    // Get context (last few words from the document)
    const docKey = document.uri.toString();
    const contextWords = this.getContextWords(document, position, docKey);
    const detectedLang = detectLanguageFromContext(contextWords.concat([prefix]));

    const items: vscode.CompletionItem[] = [];

    // 1) Phrase completion: match context + current word prefix
    if (phrasesEnabled) {
      const phrases = this.loader.getPhraseTrie().suggestions(contextWords, prefix, 3);
      for (const phrase of phrases) {
        const item = new vscode.CompletionItem(phrase, vscode.CompletionItemKind.Snippet);
        item.insertText = phrase;
        // Replace the current word AND the leading words that were already in context
        const startOfReplacement = wordRange.start.character;
        item.range = new vscode.Range(
          new vscode.Position(position.line, startOfReplacement),
          position
        );
        item.detail = "📝 Phrase";
        item.filterText = prefix;
        // Phrases should be ranked high
        item.sortText = "0" + String(10000 - phrase.length).padStart(5, "0");
        items.push(item);
      }
    }

    // 2) Word completion: from main trie (with frequency ranking)
    // (After phrases, require minimum prefix length for word completions)
    if (prefix.length < minPrefix) {
      return items;
    }
    const trie = this.loader.getTrie();
    let exactSuggestions: string[] = [];

    if (detectedLang === "de") {
      exactSuggestions = this.loader.getDeTrie().suggestions(prefix, maxSuggestions);
      // Merge in main trie suggestions that aren't in de-only list
      const mainSuggestions = trie.suggestions(prefix, maxSuggestions);
      for (const s of mainSuggestions) {
        if (!exactSuggestions.includes(s) && exactSuggestions.length < maxSuggestions) {
          exactSuggestions.push(s);
        }
      }
    } else if (detectedLang === "en") {
      exactSuggestions = this.loader.getEnTrie().suggestions(prefix, maxSuggestions);
      const mainSuggestions = trie.suggestions(prefix, maxSuggestions);
      for (const s of mainSuggestions) {
        if (!exactSuggestions.includes(s) && exactSuggestions.length < maxSuggestions) {
          exactSuggestions.push(s);
        }
      }
    } else {
      exactSuggestions = trie.suggestions(prefix, maxSuggestions);
    }

    if (exactSuggestions.length === 0 && fuzzyEnabled && prefix.length >= 3) {
      // Fallback to fuzzy matching for typos
      exactSuggestions = trie.fuzzySuggestions(prefix, maxSuggestions, 2);
    }

    for (const word of exactSuggestions) {
      const item = new vscode.CompletionItem(word, vscode.CompletionItemKind.Text);
      item.insertText = word;
      item.range = wordRange;
      item.filterText = word;
      item.detail = "📖 Dictionary";

      // Add a sortText so the most frequent come first
      const score = trie.getScore(word);
      item.sortText = String(1000000 - score).padStart(8, "0");

      // Documentation: show context info
      const docs: string[] = [];
      docs.push(`**${word}**`);
      if (score > 1) {
        docs.push(`\n_Frequency: ${score.toLocaleString()}_`);
      }
      const lang = this.detectWordLang(word);
      if (lang !== "unknown") {
        docs.push(`\n_Language: ${lang.toUpperCase()}_`);
      }
      item.documentation = new vscode.MarkdownString(docs.join(""));

      items.push(item);
    }

    // 3) N-gram next-word prediction: if there's a context and we just typed a complete word
    if (ngramsEnabled && contextWords.length >= 1) {
      const nextWords = this.loader.getNgramModel().predict(contextWords, 5);
      for (const next of nextWords) {
        // Don't add if it's already in the list
        if (items.some((i) => i.label === next)) continue;
        const item = new vscode.CompletionItem(next, vscode.CompletionItemKind.Text);
        item.insertText = next;
        item.range = new vscode.Range(position, position);
        item.filterText = " " + next;
        item.detail = "🧠 Next word";
        item.sortText = "9" + String(10000 - next.length).padStart(5, "0");
        const ctxStr = contextWords.slice(-2).join(" ");
        item.documentation = new vscode.MarkdownString(
          `**${next}** _(predicted after "${ctxStr}")_`
        );
        items.push(item);
      }
    }

    // 4) Track the typed prefix for learning
    if (userLearning && prefix.length >= 3 && this.looksLikeRealWord(prefix)) {
      this.loader.learnWord(prefix, 1);
    }

    return items;
  }

  /**
   * Called when user accepts a completion - track for learning.
   */
  onCompletionAccepted(document: vscode.TextDocument, position: vscode.Position, insertedText: string): void {
    const config = vscode.workspace.getConfiguration("dictionaryAutocomplete");
    if (!config.get<boolean>("userLearning", true)) return;

    const docKey = document.uri.toString();
    const context = this.contextMap.get(docKey) || [];

    // Update ngram with the new context
    const tokens = [...context, insertedText.split(/\s+/)[0]];
    if (tokens.length >= 2) {
      this.loader.getNgramModel().train(tokens);
    }

    // Update context
    const newContext = [...context, insertedText].join(" ").split(/\s+/);
    this.contextMap.set(docKey, newContext.slice(-10));
  }

  /**
   * Get the last few words of context from the document.
   * Excludes the current partial word.
   */
  private getContextWords(document: vscode.TextDocument, position: vscode.Position, docKey: string): string[] {
    const lineText = document.lineAt(position.line).text;
    const beforeCursor = lineText.substring(0, position.character);
    // The current partial word is everything from the last whitespace to the cursor.
    // We want the words BEFORE that.
    const trimmed = beforeCursor.replace(/\S*$/, "").trim();
    const words = trimmed.length > 0 ? trimmed.split(/\s+/) : [];
    const lastFew = words.slice(-3);

    // Also include words from previous lines if we just hit a newline
    if (lastFew.length < 2 && position.line > 0) {
      const prevLine = document.lineAt(position.line - 1).text;
      const prevWords = prevLine.split(/\s+/).filter((w) => w.length > 0);
      lastFew.unshift(...prevWords.slice(-(2 - lastFew.length)));
    }

    this.contextMap.set(docKey, lastFew);
    return lastFew;
  }

  private detectWordLang(word: string): "en" | "de" | "unknown" {
    if (/[äöüÄÖÜß]/.test(word)) return "de";
    return "unknown";
  }

  private looksLikeRealWord(s: string): boolean {
    return /^[a-zA-ZäöüÄÖÜß]{3,}$/.test(s);
  }

  private getWordRange(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.Range {
    const lineText = document.lineAt(position.line).text;
    const cursor = position.character;

    let start = cursor;
    while (start > 0) {
      const ch = lineText.charAt(start - 1);
      if (!this.isWordChar(ch)) break;
      start--;
    }

    return new vscode.Range(
      new vscode.Position(position.line, start),
      new vscode.Position(position.line, cursor)
    );
  }

  private isWordChar(ch: string): boolean {
    return /[a-zA-ZäöüÄÖÜß]/.test(ch);
  }
}

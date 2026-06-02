import * as vscode from "vscode";
import { DictionaryLoader } from "./DictionaryLoader";

/**
 * Provides completion items from the dictionary trie.
 * Triggers on every character and looks up the current word prefix.
 */
export class DictionaryProvider implements vscode.CompletionItemProvider {
  constructor(private loader: DictionaryLoader) {}

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    _context: vscode.CompletionContext
  ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
    const config = vscode.workspace.getConfiguration("dictionaryAutocomplete");
    if (!config.get<boolean>("enabled", true)) {
      return [];
    }

    const minPrefix = config.get<number>("minPrefixLength", 2);
    const maxSuggestions = config.get<number>("maxSuggestions", 20);

    const wordRange = this.getWordRange(document, position);
    const prefix = document.getText(wordRange);

    if (prefix.length < minPrefix) {
      return [];
    }

    // Only suggest if we are in a "word" context (not inside a number/code block etc.)
    // Heuristic: skip if previous char is `.` (likely method call / file extension)
    // and the prefix doesn't look like a natural word.
    if (prefix.length >= 1 && /^\d/.test(prefix)) {
      return [];
    }

    const trie = this.loader.getTrie();
    const suggestions = trie.suggestions(prefix, maxSuggestions);
    if (suggestions.length === 0) {
      return [];
    }

    return suggestions.map((word) => {
      const item = new vscode.CompletionItem(word, vscode.CompletionItemKind.Text);
      item.insertText = word;
      item.range = wordRange;
      item.filterText = word;
      item.detail = "Dictionary";
      // Documentation: short hint about the word
      item.documentation = new vscode.MarkdownString(
        `**${word}**\n\n_Length: ${word.length}_`
      );
      // Don't trigger on dots/underscores in case other providers want to handle them
      return item;
    });
  }

  /**
   * Get the range of the current "word" at the cursor.
   * A word here means a run of letters/umlauts - not code identifiers.
   * We expand from the cursor backwards, then forward by zero (no future chars).
   */
  private getWordRange(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.Range {
    const lineText = document.lineAt(position.line).text;
    const cursor = position.character;

    // Expand backwards
    let start = cursor;
    while (start > 0) {
      const ch = lineText.charAt(start - 1);
      if (!this.isWordChar(ch)) break;
      start--;
    }

    // We do NOT expand forwards - the user is still typing.
    return new vscode.Range(
      new vscode.Position(position.line, start),
      new vscode.Position(position.line, cursor)
    );
  }

  private isWordChar(ch: string): boolean {
    return /[a-zA-ZäöüÄÖÜß]/.test(ch);
  }
}

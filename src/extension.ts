import * as vscode from "vscode";
import { DictionaryLoader } from "./DictionaryLoader";
import { DictionaryProvider } from "./DictionaryProvider";

let statusBarItem: vscode.StatusBarItem | undefined;

export function activate(context: vscode.ExtensionContext) {
  console.log("[DictionaryAutocomplete] activating");

  const loader = new DictionaryLoader();
  const provider = new DictionaryProvider(loader);

  // Load dictionaries based on current settings
  const loadFromConfig = () => {
    const config = vscode.workspace.getConfiguration("dictionaryAutocomplete");
    const enabled = config.get<boolean>("enabled", true);
    if (!enabled) {
      loader.build([], []);
      updateStatusBar(loader);
      return;
    }
    const languages = config.get<string[]>("languages", ["en", "de"]);
    const customPaths = config.get<string[]>("customPaths", []);
    loader.build(languages, customPaths);
    updateStatusBar(loader);
  };

  loadFromConfig();

  // Status bar item showing word count
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = "dictionaryAutocomplete.reload";
  updateStatusBar(loader);
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Register provider for configured file types.
  // Use a permissive selector (all files) but the provider itself filters
  // out non-word prefixes to avoid interfering with code editing.
  const fileTypes =
    vscode.workspace
      .getConfiguration("dictionaryAutocomplete")
      .get<string[]>("fileTypes", ["*"]) ?? ["*"];

  const selector: vscode.DocumentSelector =
    fileTypes.length === 1 && fileTypes[0] === "*"
      ? { scheme: "file" }
      : fileTypes.map((t) => ({ scheme: "file", language: t }));

  // Trigger on all letters + umlauts so suggestions appear immediately.
  const triggers = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZäöüÄÖÜß".split("");

  const disposable = vscode.languages.registerCompletionItemProvider(
    selector,
    provider,
    ...triggers
  );
  context.subscriptions.push(disposable);

  // Command: reload dictionaries
  context.subscriptions.push(
    vscode.commands.registerCommand("dictionaryAutocomplete.reload", () => {
      loadFromConfig();
      vscode.window.showInformationMessage(
        `Dictionary reloaded: ${loader.getWordCount()} words (${loader
          .getLoadedLanguages()
          .join(", ")})`
      );
    })
  );

  // Command: add current word to a user dictionary file
  context.subscriptions.push(
    vscode.commands.registerCommand("dictionaryAutocomplete.addWord", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const wordRange = editor.document.getWordRangeAtPosition(
        editor.selection.active,
        /[a-zA-ZäöüÄÖÜß'-]+/
      );
      if (!wordRange) {
        vscode.window.showWarningMessage("No word at cursor");
        return;
      }
      const word = editor.document.getText(wordRange);
      const target = await vscode.window.showInputBox({
        prompt: `Save "${word}" to which file?`,
        value: pathJoin(
          context.extensionPath,
          "out",
          "dictionaries",
          "user.json"
        ),
      });
      if (!target) return;
      saveWordToFile(target, word);
      vscode.window.showInformationMessage(`Saved "${word}" to ${target}`);
    })
  );

  // Reload when configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("dictionaryAutocomplete")) {
        loadFromConfig();
      }
    })
  );
}

function updateStatusBar(loader: DictionaryLoader) {
  if (!statusBarItem) return;
  const n = loader.getWordCount();
  const langs = loader.getLoadedLanguages().join("/") || "none";
  statusBarItem.text = `$(book) ${n}`;
  statusBarItem.tooltip = `Dictionary Autocomplete: ${n} words (${langs})`;
}

function pathJoin(...parts: string[]): string {
  return parts.join("/").replace(/\/+/g, "/");
}

function saveWordToFile(filePath: string, word: string): void {
  const fs = require("fs") as typeof import("fs");
  let data: string[] = [];
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      data = parsed;
    }
  } catch {
    // file doesn't exist or is empty - start fresh
  }
  if (!data.includes(word)) {
    data.push(word);
    data.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

export function deactivate() {
  statusBarItem?.dispose();
}

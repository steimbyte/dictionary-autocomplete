import * as vscode from "vscode";
import { DictionaryLoader } from "./DictionaryLoader";
import { DictionaryProvider } from "./DictionaryProvider";

let statusBarItem: vscode.StatusBarItem | undefined;
let loader: DictionaryLoader;
let provider: DictionaryProvider;

export function activate(context: vscode.ExtensionContext) {
  console.log("[DictionaryAutocomplete] activating");

  loader = new DictionaryLoader();
  provider = new DictionaryProvider(loader);

  // Lazy loading: do NOT build dictionaries on activation.
  // Build will happen on first completion request (see provider).
  // Just show a status indicator.
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = "dictionaryAutocomplete.reload";
  updateStatusBar();
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Register the provider
  const fileTypes =
    vscode.workspace
      .getConfiguration("dictionaryAutocomplete")
      .get<string[]>("fileTypes", ["*"]) ?? ["*"];

  const selector: vscode.DocumentSelector =
    fileTypes.length === 1 && fileTypes[0] === "*"
      ? { scheme: "file" }
      : fileTypes.map((t) => ({ scheme: "file", language: t }));

  const triggers = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZäöüÄÖÜß".split("");

  const disposable = vscode.languages.registerCompletionItemProvider(
    selector,
    provider,
    ...triggers
  );
  context.subscriptions.push(disposable);

  // Track when user accepts a completion
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((e) => {
      // Heuristic: detect completion acceptance via selection change
      // (the actual mechanism is via inline completion API, but for
      //  dropdown completions we don't get a direct hook. This is a
      //  best-effort.)
    })
  );

  // Command: reload dictionaries
  context.subscriptions.push(
    vscode.commands.registerCommand("dictionaryAutocomplete.reload", async () => {
      const config = vscode.workspace.getConfiguration("dictionaryAutocomplete");
      const languages = config.get<string[]>("languages", ["en", "de"]);
      const customPaths = config.get<string[]>("customPaths", []);
      await loader.build(languages, customPaths);
      updateStatusBar();
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
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration("dictionaryAutocomplete")) {
        // Force reload on next access by clearing the loaded flag
        // (in-place rebuild is also fine)
        const config = vscode.workspace.getConfiguration("dictionaryAutocomplete");
        const languages = config.get<string[]>("languages", ["en", "de"]);
        const customPaths = config.get<string[]>("customPaths", []);
        await loader.build(languages, customPaths);
        updateStatusBar();
      }
    })
  );
}

function updateStatusBar() {
  if (!statusBarItem) return;
  if (!loader.isLoaded()) {
    statusBarItem.text = "$(book) dict (lazy)";
    statusBarItem.tooltip = "Dictionary Autocomplete (lazy-loaded on first keystroke)";
    return;
  }
  const n = loader.getWordCount();
  const langs = loader.getLoadedLanguages().join("/") || "none";
  statusBarItem.text = `$(book) ${n}`;
  statusBarItem.tooltip = `Dictionary Autocomplete: ${n} words (${langs}) — click to reload`;
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

// Shared mock for vscode
const path = require("path");

const vscodeMock = {
  CompletionItem: class {
    constructor(label, kind) {
      this.label = label;
      this.kind = kind;
    }
  },
  CompletionItemKind: {
    Text: 0, Method: 1, Function: 2, Field: 4, Variable: 5,
    Class: 6, Interface: 7, Module: 8, Property: 9, Keyword: 14,
    Snippet: 15, User: 25,
  },
  MarkdownString: class { constructor(v) { this.value = v; } },
  Range: class { constructor(s, e) { this.start = s; this.end = e; } },
  Position: class { constructor(l, c) { this.line = l; this.character = c; } },
  StatusBarAlignment: { Left: 1, Right: 2 },
  workspace: {
    getConfiguration: (section) => ({
      get: (key, def) => {
        const defaults = {
          enabled: true, languages: ["en", "de"], customPaths: [],
          minPrefixLength: 2, maxSuggestions: 20, fileTypes: ["*"],
        };
        return key in defaults ? defaults[key] : def;
      },
    }),
    onDidChangeConfiguration: () => ({ dispose: () => {} }),
  },
  extensions: {
    getExtension: (id) => ({ extensionPath: path.join(__dirname, "..") }),
  },
  window: {
    createStatusBarItem: () => ({
      show: () => {}, dispose: () => {},
      command: null, text: "", tooltip: "",
    }),
    showInformationMessage: (m) => console.log("[info]", m),
    showWarningMessage: (m) => console.log("[warn]", m),
    activeTextEditor: null,
  },
  commands: {
    registerCommand: (cmd, fn) => ({ dispose: () => {} }),
  },
  languages: {
    registerCompletionItemProvider: (selector, provider, ...triggers) => {
      global.__PROVIDER__ = provider;
      global.__SELECTOR__ = selector;
      global.__TRIGGERS__ = triggers;
      return { dispose: () => {} };
    },
  },
  CancellationToken: class {
    isCancellationRequested = false;
    onCancellationRequested = () => ({ dispose: () => {} });
  },
  CompletionContext: class {},
};

module.exports = vscodeMock;

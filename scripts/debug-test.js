// Debug test: investigate why ngram is triggered with no context
const path = require("path");
const Module = require("module");
const vscodeMock = require("./test-mock.js");

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === "vscode") return "vscode-mock";
  return originalResolve.call(this, request, ...args);
};
require.cache["vscode-mock"] = {
  id: "vscode-mock", filename: "vscode-mock", loaded: true, exports: vscodeMock,
};

const { activate } = require("../out/extension.js");
const ctx = { subscriptions: [], extensionPath: path.join(__dirname, "..") };
activate(ctx);

const provider = global.__PROVIDER__;

// Test the trie directly
const { Trie } = require("../out/Trie.js");
const fs = require("fs");
const trie = new Trie();
const de = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "out", "dictionaries", "de.json"), "utf8"));
for (const item of de) {
  if (typeof item === "string") trie.insert(item, 1);
  else trie.insert(item.w, item.s);
}
console.log("Trie size:", trie.size());
console.log("Direct 'Häu' exact:", trie.suggestions("Häu", 5));
console.log("Direct 'Häu' fuzzy:", trie.fuzzySuggestions("Häu", 5, 2).slice(0, 10));
console.log("Damerau häu vs be:", (() => {
  // Inline test
  const fn = require("../out/Trie.js");
  // Just test - not exported
  return "?";
})());

const mockDoc = (text) => ({
  lineAt: (line) => ({ text }),
  getText: (range) => {
    if (!range) return text;
    const lineText = text.split("\n")[range.start.line] || "";
    return lineText.substring(range.start.character, range.end.character);
  },
  languageId: "markdown",
  uri: { toString: () => "test://test.md" },
});

// Test "Häu|"
const text = "Häu";
const pos = new vscodeMock.Position(0, 3);
const doc = mockDoc(text);
console.log("Document text:", JSON.stringify(text));
console.log("Position:", pos.line, pos.character);

(async () => {
  const items = await provider.provideCompletionItems(
    doc, pos, new vscodeMock.CancellationToken(), new vscodeMock.CompletionContext()
  );
  console.log("Items count:", items.length);
  for (const i of items.slice(0, 15)) {
    console.log("  -", i.label, "::", i.detail);
  }
})();

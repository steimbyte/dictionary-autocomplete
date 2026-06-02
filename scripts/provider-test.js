// Integration test: load the provider with a mock VSCode and test completions
const path = require("path");
const Module = require("module");

const vscodeMock = require("./test-mock.js");

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === "vscode") return "vscode-mock";
  return originalResolve.call(this, request, ...args);
};
require.cache["vscode-mock"] = {
  id: "vscode-mock",
  filename: "vscode-mock",
  loaded: true,
  exports: vscodeMock,
};

const { activate } = require("../out/extension.js");
const mockContext = { subscriptions: [], extensionPath: path.join(__dirname, "..") };
activate(mockContext);

const provider = global.__PROVIDER__;
if (!provider) { console.error("FAIL: provider not registered"); process.exit(1); }

console.log("=== Extension activated ===");
console.log("Selector:", JSON.stringify(global.__SELECTOR__));
console.log("Trigger chars count:", global.__TRIGGERS__?.length);
console.log("Subscriptions:", mockContext.subscriptions.length);

const mockDoc = (text) => ({
  lineAt: (line) => ({ text }),
  getText: (range) => {
    if (!range) return text;
    const lineText = text.split("\n")[range.start.line] || "";
    return lineText.substring(range.start.character, range.end.character);
  },
  languageId: "markdown",
  fileName: "test.md",
  uri: { fsPath: "/tmp/test.md" },
});

const tests = [
  { text: "Schm|", prefix: "Schm", expectSome: true, label: "German Schmetterling" },
  { text: "Butt|", prefix: "Butt", expectSome: true, label: "English butterfly" },
  { text: "Haus|", prefix: "Haus", expectSome: true, label: "German Haus" },
  { text: "Apfel|", prefix: "Apfel", expectSome: true, label: "German Apfel" },
  { text: "Comp|", prefix: "Comp", expectSome: true, label: "English computer" },
  { text: "a|", prefix: "a", expectSome: true, label: "single char (phrases only, no word completions)" },
  { text: "xyzqq|", prefix: "xyzqq", expectSome: false, label: "non-matching prefix" },
  { text: "Häu|", prefix: "Häu", expectSome: true, label: "Häu (fuzzy: tau, Tau, Tha)" },
  { text: "Schmet|", prefix: "Schmet", expectSome: true, label: "Schmetterling" },
  { text: "Progr|", prefix: "Progr", expectSome: true, label: "Programm" },
  { text: "Com|", prefix: "Com", expectSome: true, label: "Computer" },
  { text: "Wörterbuch|", prefix: "Wörterbuch", expectSome: false, label: "Wörterbuch (no fuzzy matches)" },
];

let pass = 0, fail = 0;
const start = Date.now();

(async () => {
  for (const t of tests) {
    const cursorChar = t.text.indexOf("|");
    const line = t.text.replace("|", "");
    const pos = new vscodeMock.Position(0, cursorChar);
    const doc = mockDoc(line);
    const items = await provider.provideCompletionItems(
      doc, pos, new vscodeMock.CancellationToken(), new vscodeMock.CompletionContext()
    );
    const arr = Array.isArray(items) ? items : (items?.items || []);
    const labels = arr.map(i => i.label);
    const got = arr.length;
    const ok = t.expectSome ? got > 0 : got === 0;
    if (ok) {
      pass++;
      console.log(`  ✓ ${t.label}: ${got} items, e.g. ${JSON.stringify(labels.slice(0, 3))}`);
    } else {
      fail++;
      console.log(`  ✗ ${t.label}: expected ${t.expectSome ? ">0" : "0"} items, got ${got} (${JSON.stringify(labels.slice(0, 3))})`);
    }
  }
  const totalMs = Date.now() - start;
  console.log(`\n=== ${pass} passed, ${fail} failed in ${totalMs}ms ===`);
  process.exit(fail > 0 ? 1 : 0);
})();

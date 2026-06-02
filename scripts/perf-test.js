// Performance test: measure activation and lookup times
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

const t0 = Date.now();
const { activate } = require("../out/extension.js");
const ctx = { subscriptions: [], extensionPath: path.join(__dirname, "..") };
activate(ctx);
const actMs = Date.now() - t0;

console.log(`Activation: ${actMs}ms (with both EN+DE defaults, 243k words total)`);
console.log(`Subscriptions: ${ctx.subscriptions.length}`);

const provider = global.__PROVIDER__;
const mockDoc = (text) => ({
  lineAt: (line) => ({ text }),
  getText: (range) => text.substring(range.start.character, range.end.character),
  languageId: "markdown",
});

const prefixes = ["S", "Sc", "Sch", "Schm", "Schme", "Schmet", "Schmett"];
console.log("\n=== Lookup latency (avg of 1000 runs) ===");
for (const p of prefixes) {
  const line = p;
  const pos = new vscodeMock.Position(0, line.length);
  const doc = mockDoc(line);
  // Warm up
  for (let i = 0; i < 100; i++) {
    provider.provideCompletionItems(doc, pos, new vscodeMock.CancellationToken(), new vscodeMock.CompletionContext());
  }
  // Measure
  const s = Date.now();
  for (let i = 0; i < 1000; i++) {
    provider.provideCompletionItems(doc, pos, new vscodeMock.CancellationToken(), new vscodeMock.CompletionContext());
  }
  const ms = Date.now() - s;
  console.log(`  prefix "${p}" → ${(ms/1000).toFixed(3)}ms per call (${ms}ms / 1000 calls)`);
}

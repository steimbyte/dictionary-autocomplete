// End-to-end test: load both default dictionaries and verify both work
const path = require("path");
const fs = require("fs");

const { Trie } = require("../out/Trie.js");

const trie = new Trie();
const en = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "out", "dictionaries", "en.json"), "utf8"));
const de = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "out", "dictionaries", "de.json"), "utf8"));

for (const w of en) trie.insert(w);
for (const w of de) trie.insert(w);

console.log(`Total: ${trie.size()} words (en: ${en.length}, de: ${de.length})`);

const cases = [
  ["hel", "English 'hel'"],
  ["hau", "German 'hau' (Haus)"],
  ["Häu", "German 'Häu' (Häuser)"],
  ["schmet", "German 'schmet' (Schmetterling)"],
  ["th", "English 'th'"],
  ["üb", "German 'üb' (über)"],
  ["Apfel", "German 'Apfel'"],
  ["Comp", "English 'Comp'"],
  ["Butter", "English 'Butter'"],
  ["quant", "English 'quant'"],
];

for (const [prefix, label] of cases) {
  const start = Date.now();
  const suggestions = trie.suggestions(prefix, 5);
  const ms = Date.now() - start;
  console.log(`\n${label}: ${JSON.stringify(suggestions)} (${ms}ms)`);
}

// Stress: simulate typing many prefixes
const prefixes = ["h", "ho", "hou", "hous", "house", "ha", "han", "hand"];
console.log("\n=== Typing simulation (8 progressive prefixes) ===");
const typingStart = Date.now();
for (const p of prefixes) {
  const s = trie.suggestions(p, 20);
  console.log(`'${p}' → ${s.length} suggestions`);
}
const typingTime = Date.now() - typingStart;
console.log(`Total: ${typingTime}ms`);

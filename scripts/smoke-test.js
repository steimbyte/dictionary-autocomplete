// Smoke test: verify trie works with sample words
const path = require("path");
const fs = require("fs");

// Load compiled Trie
const { Trie } = require("../out/Trie.js");

const trie = new Trie();

// Insert some English words
const en = ["the", "they", "them", "there", "their", "butterfly", "schmetterling", "house", "home", "happy"];
for (const w of en) trie.insert(w);

// Insert some German words with umlauts
const de = ["Haus", "Häuser", "Maus", "Mäuse", "Schmetterling", "Schmetterlinge", "tschüss", "über", "Öl"];
for (const w of de) trie.insert(w);

console.log("=== Test 1: English prefix 'th' ===");
console.log(trie.suggestions("th", 10));

console.log("\n=== Test 2: English prefix 'butt' ===");
console.log(trie.suggestions("butt", 10));

console.log("\n=== Test 3: German prefix 'Hä' (umlaut) ===");
console.log(trie.suggestions("Hä", 10));

console.log("\n=== Test 4: German prefix 'Schm' ===");
console.log(trie.suggestions("Schm", 10));

console.log("\n=== Test 5: Mixed case prefix 'SCHMETT' ===");
console.log(trie.suggestions("SCHMETT", 10));

console.log("\n=== Test 6: Non-matching prefix ===");
console.log(trie.suggestions("xyzqq", 5));

console.log("\n=== Total words inserted:", trie.size());

// Performance: load full English dict and time lookup
console.log("\n=== Performance test: load 50k English words ===");
const enPath = path.join(__dirname, "..", "out", "dictionaries", "en.json");
const start = Date.now();
const allEn = JSON.parse(fs.readFileSync(enPath, "utf8"));
const bigTrie = new Trie();
for (const w of allEn) bigTrie.insert(w);
const insertTime = Date.now() - start;
console.log(`Inserted ${bigTrie.size()} words in ${insertTime}ms`);

const lookupStart = Date.now();
const suggestions = bigTrie.suggestions("Schmet", 20);
const lookupTime = Date.now() - lookupStart;
console.log(`Lookup "Schmet" returned ${suggestions.length} suggestions in ${lookupTime}ms`);
console.log("First suggestions:", suggestions.slice(0, 5));

const prefixStart = Date.now();
for (let i = 0; i < 1000; i++) {
  bigTrie.suggestions("au", 20);
}
const prefixTime = Date.now() - prefixStart;
console.log(`1000 prefix lookups took ${prefixTime}ms (avg ${(prefixTime/1000).toFixed(2)}ms)`);

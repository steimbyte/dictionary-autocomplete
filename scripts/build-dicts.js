#!/usr/bin/env node
/**
 * Build comprehensive dictionaries from multiple sources:
 * - English: /usr/share/dict/cracklib-small (or words)
 * - German:  merge from
 *            - Telegram de_DE.dic (592k words with all inflections)
 *            - Flatpak de_DE_frami.dic (193k base forms)
 *            - OpenThesaurus SQL dump (synonyms added as separate words)
 *
 * Output: src/dictionaries/{en,de}.json and out/dictionaries/{en,de}.json
 *         (deduplicated, sorted, lowercased)
 */
const fs = require("fs");
const path = require("path");

const SRC_DIR = path.join(__dirname, "..", "src", "dictionaries");
const OUT_DIR = path.join(__dirname, "..", "out", "dictionaries");
fs.mkdirSync(SRC_DIR, { recursive: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

const LETTER_ONLY = /^[a-zA-Z]+$/;
const LETTER_UMLAUT = /^[a-zA-ZäöüÄÖÜß]+$/;
const MIN_LEN = 2;
const MAX_LEN = 30;

function loadEnglish() {
  const sources = [
    "/usr/share/dict/cracklib-small",
    "/usr/share/dict/words",
    "/usr/share/dict/american-english",
  ];
  for (const src of sources) {
    if (fs.existsSync(src)) {
      const text = fs.readFileSync(src, "utf8");
      const set = new Set();
      for (const line of text.split("\n")) {
        const w = line.trim();
        if (w && LETTER_ONLY.test(w) && w.length >= MIN_LEN && w.length <= MAX_LEN) {
          set.add(w);
        }
      }
      console.log(`[en] ${set.size} words from ${src}`);
      return Array.from(set);
    }
  }
  return ["the", "be", "to", "of", "and"];
}

function loadHunspell(file, allowUmlauts, label) {
  if (!fs.existsSync(file)) {
    console.warn(`[${label}] not found: ${file}`);
    return new Set();
  }
  const set = new Set();
  const pattern = allowUmlauts ? LETTER_UMLAUT : LETTER_ONLY;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line || line.startsWith("/") || line.startsWith("#")) continue;
    const slash = line.indexOf("/");
    const w = (slash >= 0 ? line.slice(0, slash) : line).trim();
    if (w && pattern.test(w) && w.length >= MIN_LEN && w.length <= MAX_LEN) {
      set.add(w);
    }
  }
  console.log(`[${label}] ${set.size} words from ${file}`);
  return set;
}

function loadOpenThesaurus(sqlPath) {
  if (!fs.existsSync(sqlPath)) {
    console.warn(`[ot] not found: ${sqlPath}`);
    return new Set();
  }
  // Parse INSERT INTO `term` (...word...) VALUES
  // Format: ('word',) or ('word','normalized',...) or multi-row
  // We want the `word` column - it's the 9th column in the term table.
  const set = new Set();
  const text = fs.readFileSync(sqlPath, "utf8");
  // Match lines that are INSERT into term
  // Simpler: just regex for word values
  const re = /INSERT INTO `term`[^;]*;/g;
  let m;
  let count = 0;
  while ((m = re.exec(text)) !== null) {
    const block = m[0];
    // Find all (....) tuples - each contains 10 values for term table
    const tupleRe = /\(([^)]+)\)/g;
    let t;
    while ((t = tupleRe.exec(block)) !== null) {
      const vals = t[1];
      // Word is the 9th value (1-indexed), but the order in VALUES can vary
      // For term table, looking at the schema: id, version, language_id, level_id,
      //   normalized_word, original_id, synset_id, user_comment, word, normalized_word2
      // word is at index 8 (0-indexed)
      const fields = parseTuple(vals);
      if (fields.length < 9) continue;
      const w = fields[8].replace(/^'(.*)'$/, "$1").replace(/\\'/g, "'").replace(/\\\\/g, "\\");
      if (w && LETTER_UMLAUT.test(w) && w.length >= MIN_LEN && w.length <= MAX_LEN) {
        set.add(w);
        count++;
      }
    }
  }
  console.log(`[ot] ${set.size} unique words from OpenThesaurus (${count} total)`);
  return set;
}

function parseTuple(str) {
  // Simple SQL tuple parser - handles quoted strings and NULL
  const out = [];
  let i = 0;
  while (i < str.length) {
    while (i < str.length && (str[i] === " " || str[i] === ",")) i++;
    if (i >= str.length) break;
    if (str[i] === "'") {
      // Quoted string
      i++;
      let s = "";
      while (i < str.length && str[i] !== "'") {
        if (str[i] === "\\" && i + 1 < str.length) {
          s += str[i + 1];
          i += 2;
        } else {
          s += str[i];
          i++;
        }
      }
      i++; // skip closing quote
      out.push("'" + s + "'");
    } else {
      // Unquoted value (number, NULL)
      let s = "";
      while (i < str.length && str[i] !== ",") {
        s += str[i];
        i++;
      }
      out.push(s.trim());
    }
  }
  return out;
}

function loadGerman() {
  const merged = new Set();

  // 1. Telegram de_DE.dic (592k, includes many inflections)
  const tel = loadHunspell(
    "/home/steimer/.var/app/org.telegram.desktop/data/TelegramDesktop/tdata/dictionaries/de_DE/de_DE.dic",
    true,
    "de_tel"
  );
  for (const w of tel) merged.add(w);

  // 2. Flatpak frami de_DE (193k base forms)
  const fra = loadHunspell(
    "/var/lib/flatpak/runtime/org.gnome.Platform.Locale/x86_64/48/8987d720c70ceca711f45c6caf28a479b3a805a25ab7387ccc151085909b4db2-de-en/files/de/share/de/hunspell/de_DE_frami.dic",
    true,
    "de_fra"
  );
  for (const w of fra) merged.add(w);

  // 3. OpenThesaurus German synonyms
  const ot = loadOpenThesaurus("/tmp/openthesaurus_dump.sql");
  for (const w of ot) merged.add(w);

  console.log(`[de] merged total: ${merged.size} unique words`);
  return Array.from(merged);
}

function writeJson(filename, data) {
  const sorted = data.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  for (const dir of [SRC_DIR, OUT_DIR]) {
    const file = path.join(dir, filename);
    fs.writeFileSync(file, JSON.stringify(sorted), "utf8");
    const sizeKb = (fs.statSync(file).size / 1024).toFixed(1);
    console.log(`  wrote ${file} (${sorted.length} words, ${sizeKb} KB)`);
  }
}

console.log("=== Building English dictionary ===");
const en = loadEnglish();
writeJson("en.json", en);

console.log("\n=== Building German dictionary (3 sources merged) ===");
const de = loadGerman();
writeJson("de.json", de);

console.log("\n=== Summary ===");
console.log(`English: ${en.length} words`);
console.log(`German:  ${de.length} words`);
console.log(`Total:   ${en.length + de.length} words`);
console.log("done.");

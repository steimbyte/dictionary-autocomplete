#!/usr/bin/env node
/**
 * Build comprehensive dictionaries + phrase list + n-gram model.
 *
 * Word data sources (merged, deduplicated, scored):
 *   - English: /usr/share/dict/cracklib-small + COCA top 5000 frequencies
 *   - German:  Telegram de_DE.dic + Flatpak frami de_DE + OpenThesaurus
 *              + OpenSubtitles frequencies
 *
 * Phrase data:
 *   - Bundled hardcoded common phrases (DE + EN)
 *
 * N-gram data:
 *   - Bundled hardcoded common patterns (DE + EN)
 *
 * Output (in compact JSON for size):
 *   - src/dictionaries/{en,de}.json : [ { w: "word", s: score }, ... ]
 *   - src/dictionaries/phrases.json : [ "phrase1", "phrase2", ... ]
 *   - src/dictionaries/ngrams.json  : { bigrams, trigrams, unigrams, total }
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

// Ultra-compact form: [ "plain_word", { w: "word", s: score }, ... ]
// Plain strings for default score 1, objects only when scored.
// Sort: by score desc, then alphabetical asc
function compactFormat(wordToScore) {
  const arr = [];
  for (const [w, s] of wordToScore.entries()) {
    if (s === 1) {
      arr.push(w);
    } else {
      arr.push({ w, s });
    }
  }
  arr.sort((a, b) => {
    const aIsObj = typeof a === "object";
    const bIsObj = typeof b === "object";
    const aScore = aIsObj ? a.s : 1;
    const bScore = bIsObj ? b.s : 1;
    if (bScore !== aScore) return bScore - aScore;
    const aW = aIsObj ? a.w : a;
    const bW = bIsObj ? b.w : b;
    return aW.localeCompare(bW);
  });
  return arr;
}

function writeJson(filename, data) {
  const json = JSON.stringify(data);
  for (const dir of [SRC_DIR, OUT_DIR]) {
    const file = path.join(dir, filename);
    fs.writeFileSync(file, json, "utf8");
    const sizeKb = (fs.statSync(file).size / 1024).toFixed(1);
    console.log(`  wrote ${file} (${Array.isArray(data) ? data.length : "obj"} entries, ${sizeKb} KB)`);
  }
}

function loadHunspell(file, allowUmlauts) {
  if (!fs.existsSync(file)) {
    console.warn(`  not found: ${file}`);
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
  return set;
}

function loadOpenThesaurusWords(sqlPath) {
  if (!fs.existsSync(sqlPath)) return new Set();
  const set = new Set();
  const text = fs.readFileSync(sqlPath, "utf8");
  const re = /INSERT INTO `term`[^;]*;/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const block = m[0];
    const tupleRe = /\(([^)]+)\)/g;
    let t;
    while ((t = tupleRe.exec(block)) !== null) {
      const fields = parseTuple(t[1]);
      if (fields.length < 9) continue;
      const w = fields[8].replace(/^'(.*)'$/, "$1").replace(/\\'/g, "'").replace(/\\\\/g, "\\");
      if (w && LETTER_UMLAUT.test(w) && w.length >= MIN_LEN && w.length <= MAX_LEN) {
        set.add(w);
      }
    }
  }
  return set;
}

function parseTuple(str) {
  const out = [];
  let i = 0;
  while (i < str.length) {
    while (i < str.length && (str[i] === " " || str[i] === ",")) i++;
    if (i >= str.length) break;
    if (str[i] === "'") {
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
      i++;
      out.push("'" + s + "'");
    } else {
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

function loadFrequencyMap(file) {
  if (!fs.existsSync(file)) return new Map();
  const map = new Map();
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line) continue;
    const parts = line.split(/[,\t]/);
    if (parts.length < 2) continue;
    const w = parts[0].trim().toLowerCase();
    const f = parseInt(parts[1], 10);
    if (w && !isNaN(f) && f > 0) {
      map.set(w, f);
    }
  }
  return map;
}

// ============================================================
// English: cracklib + COCA frequencies
// ============================================================
function buildEnglish() {
  const words = new Set();
  const scores = new Map();

  // 1. cracklib-small (base vocabulary)
  for (const w of loadHunspell("/usr/share/dict/cracklib-small", false)) {
    words.add(w);
    if (!scores.has(w)) scores.set(w, 1);
  }
  console.log(`[en] cracklib-small: ${words.size} base words`);

  // 2. COCA frequencies
  const coca = loadFrequencyMap("/tmp/coca_5000.csv");
  // skip header
  const cocaFile = "/tmp/coca_5000.csv";
  if (fs.existsSync(cocaFile)) {
    const lines = fs.readFileSync(cocaFile, "utf8").split("\n");
    let count = 0;
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      // CSV format: rank,lemma,PoS,freq,perMil,...
      const parts = line.split(",");
      if (parts.length < 4) continue;
      const w = parts[1].trim();
      const f = parseInt(parts[3], 10);
      if (w && LETTER_ONLY.test(w) && w.length >= MIN_LEN && w.length <= MAX_LEN && f > 0) {
        words.add(w);
        // Multiply by 1000 to give it weight over base 1
        scores.set(w, f);
        count++;
      }
    }
    console.log(`[en] COCA: ${count} words with frequency`);
  } else {
    console.warn(`[en] COCA not found, using defaults`);
  }

  return compactFormat(scores);
}

// ============================================================
// German: Telegram + frami + OpenThesaurus + OpenSubtitles
// ============================================================
function buildGerman() {
  const words = new Set();
  const scores = new Map();

  // 1. Telegram de_DE.dic (base form dictionary with many inflections)
  const tel = loadHunspell(
    "/home/steimer/.var/app/org.telegram.desktop/data/TelegramDesktop/tdata/dictionaries/de_DE/de_DE.dic",
    true
  );
  for (const w of tel) {
    words.add(w);
    if (!scores.has(w)) scores.set(w, 1);
  }
  console.log(`[de] Telegram: ${tel.size} words`);

  // 2. Flatpak frami de_DE (additional base forms)
  const fra = loadHunspell(
    "/var/lib/flatpak/runtime/org.gnome.Platform.Locale/x86_64/48/8987d720c70ceca711f45c6caf28a479b3a805a25ab7387ccc151085909b4db2-de-en/files/de/share/de/hunspell/de_DE_frami.dic",
    true
  );
  for (const w of fra) {
    if (!words.has(w)) {
      words.add(w);
      scores.set(w, 1);
    }
  }
  console.log(`[de] frami: added ${fra.size - (words.size - tel.size)} new words`);

  // 3. OpenThesaurus (synonyms)
  const ot = loadOpenThesaurusWords("/tmp/openthesaurus_dump.sql");
  for (const w of ot) {
    if (!words.has(w)) {
      words.add(w);
      scores.set(w, 1);
    }
  }
  console.log(`[de] OpenThesaurus: added ${ot.size} (some duplicates)`);

  // 4. OpenSubtitles frequencies - SCORE ONLY, don't add new words
  const osFile = "/tmp/de_freq.csv";
  if (fs.existsSync(osFile)) {
    const map = loadFrequencyMap(osFile);
    let count = 0;
    for (const [w, f] of map.entries()) {
      if (words.has(w) && LETTER_UMLAUT.test(w) && w.length >= MIN_LEN && w.length <= MAX_LEN) {
        // Use log scale to keep very high frequencies from dominating
        scores.set(w, Math.log10(f + 1) * 100);
        count++;
      }
    }
    console.log(`[de] OpenSubtitles: scored ${count} existing words`);
  } else {
    console.warn(`[de] OpenSubtitles not found`);
  }

  return compactFormat(scores);
}

// ============================================================
// Phrases (hardcoded common phrases, both languages)
// ============================================================
function buildPhrases() {
  return [
    // English common phrases
    { p: "as soon as possible", s: 100 },
    { p: "at the same time", s: 90 },
    { p: "by the way", s: 95 },
    { p: "for example", s: 100 },
    { p: "in addition to", s: 85 },
    { p: "in order to", s: 95 },
    { p: "in spite of", s: 80 },
    { p: "on the other hand", s: 85 },
    { p: "thank you very much", s: 100 },
    { p: "with regard to", s: 75 },
    { p: "I would like to", s: 90 },
    { p: "looking forward to", s: 85 },
    { p: "in my opinion", s: 80 },
    { p: "as well as", s: 80 },
    { p: "a lot of", s: 95 },
    // German common phrases
    { p: "Auf Wiedersehen", s: 100 },
    { p: "Auf Wiederhören", s: 90 },
    { p: "Guten Morgen", s: 100 },
    { p: "Guten Tag", s: 100 },
    { p: "Guten Abend", s: 95 },
    { p: "Vielen Dank", s: 100 },
    { p: "mit freundlichen Grüßen", s: 100 },
    { p: "im Sinne von", s: 75 },
    { p: "in Bezug auf", s: 85 },
    { p: "auf der einen Seite", s: 70 },
    { p: "auf der anderen Seite", s: 70 },
    { p: "zum Beispiel", s: 100 },
    { p: "das heißt", s: 90 },
    { p: "ich möchte", s: 90 },
    { p: "ich würde gerne", s: 85 },
    { p: "mit der Bitte um", s: 80 },
    { p: "in der Regel", s: 80 },
    { p: "in der heutigen Zeit", s: 75 },
    { p: "im Vergleich zu", s: 80 },
    { p: "aufgrund von", s: 85 },
    { p: "infolgedessen", s: 70 },
    { p: "darüber hinaus", s: 70 },
    { p: "nichtsdestotrotz", s: 70 },
    { p: "Tschüss", s: 95 },
    { p: "Bis bald", s: 90 },
    { p: "Bis dann", s: 90 },
    { p: "Wie geht es", s: 90 },
    { p: "Wie geht es dir", s: 100 },
    { p: "Wie geht es Ihnen", s: 100 },
    { p: "Es tut mir leid", s: 95 },
    { p: "Kein Problem", s: 90 },
    { p: "In Ordnung", s: 85 },
  ];
}

// ============================================================
// N-gram training data (hardcoded common patterns)
// ============================================================
function buildNgrams() {
  // Build from a small set of common sentences
  const training = [
    // English
    "I would like to",
    "I would like to thank",
    "I would like to thank you",
    "thank you very much",
    "thank you for your",
    "looking forward to hearing",
    "looking forward to working",
    "in my opinion",
    "in the morning",
    "in the afternoon",
    "in the evening",
    "in the meantime",
    "at the same time",
    "at the moment",
    "at the end",
    "at the beginning",
    "at least",
    "as soon as possible",
    "as well as",
    "by the way",
    "for example",
    "in addition to",
    "in order to",
    "in spite of",
    "on the other hand",
    "I don't know",
    "I don't think",
    "I don't have",
    "I don't want",
    "I think it is",
    "I think we should",
    "I think you should",
    "I want to",
    "I need to",
    "I have to",
    "I am going to",
    "I will be",
    "I will have",
    "I have been",
    "it is important to",
    "it is necessary to",
    "it is possible to",
    "there is a",
    "there is no",
    "there are many",
    "this is a",
    "this is the",
    "this is not",
    "that is a",
    "that is the",
    "we need to",
    "we should be",
    "we have to",
    "we are going to",
    // German - common verbs
    "ich gehe zur",
    "ich gehe in",
    "ich gehe nach",
    "ich gehe mit",
    "ich gehe zu",
    "ich gehe auf",
    "ich gehe an",
    "ich gehe aus",
    "ich gehe über",
    "ich gehe durch",
    "ich komme aus",
    "ich komme mit",
    "ich komme nach",
    "ich komme zu",
    "ich komme in",
    "ich fahre zur",
    "ich fahre nach",
    "ich fahre mit",
    "ich fahre in",
    "ich fahre zu",
    "ich fahre auf",
    "ich habe das",
    "ich habe eine",
    "ich habe einen",
    "ich habe keine",
    "ich habe noch",
    "ich habe schon",
    "ich bin ein",
    "ich bin eine",
    "ich bin der",
    "ich bin die",
    "ich bin das",
    "ich bin nicht",
    "ich bin auch",
    "ich bin schon",
    "ich bin noch",
    "ich war in",
    "ich war bei",
    "ich war mit",
    "ich war auf",
    "ich werde zur",
    "ich werde in",
    "ich werde nach",
    "ich werde mit",
    "ich werde das",
    "ich werde die",
    "ich werde den",
    "ich möchte mich",
    "ich möchte mich bedanken",
    "ich möchte eine",
    "ich möchte einen",
    "ich möchte das",
    "ich möchte gerne",
    "ich würde mich freuen",
    "ich würde gerne",
    "ich denke das",
    "ich denke nicht",
    "ich denke es",
    "ich denke dass",
    "ich glaube das",
    "ich glaube nicht",
    "ich glaube es",
    "ich glaube dass",
    "das ist ein",
    "das ist eine",
    "das ist der",
    "das ist die",
    "das ist das",
    "das ist nicht",
    "das ist auch",
    "das ist schon",
    "das war ein",
    "das war eine",
    "das war der",
    "das war die",
    "die Firma ist",
    "die Firma hat",
    "die Firma wird",
    "das Unternehmen ist",
    "das Unternehmen hat",
    "das Unternehmen wird",
    "auf der einen",
    "auf der anderen",
    "auf der gleichen",
    "in der heutigen",
    "in der Regel",
    "in der Vergangenheit",
    "in der Zukunft",
    "in der Schule",
    "in der Arbeit",
    "in der Firma",
    "mit dem Auto",
    "mit dem Bus",
    "mit dem Zug",
    "mit der Bahn",
    "mit der Post",
    "von der Firma",
    "von der Stadt",
    "von der Arbeit",
    "von der Schule",
    "zu der Firma",
    "zu der Arbeit",
    "zu der Schule",
    "zu der Stadt",
    "Vielen Dank für",
    "Vielen Dank für Ihre",
    "Vielen Dank im Voraus",
    "mit freundlichen Grüßen",
    "im Voraus vielen Dank",
    "Auf Wiedersehen und",
    "Guten Tag Herr",
    "Guten Tag Frau",
    "Wie geht es Ihnen",
    "Wie geht es dir",
    "Es tut mir leid",
    "Könnten Sie mir",
    "Könnten Sie bitte",
    "Könnten wir bitte",
    "zum Beispiel die",
    "zum Beispiel ein",
    "zum Beispiel eine",
    "im Vergleich zu",
    "im Gegensatz zu",
    "in Bezug auf",
    "mit Hilfe von",
    "aufgrund der",
    "aufgrund von",
    "während der",
    "während des",
    "nach dem",
    "nach der",
    "vor dem",
    "vor der",
    "an der",
    "auf die",
    "für die",
    "für den",
    "mit dem",
    "mit der",
    "von dem",
    "von der",
    "zu der",
    "zu den",
    "zu einem",
    "zu einer",
    "Es ist wichtig",
    "Es ist möglich",
    "Es ist notwendig",
    "Es gibt eine",
    "Es gibt einen",
    "Es gibt keine",
    "Das ist ein",
    "Das ist eine",
    "Das ist der",
    "Das ist die",
    "Das ist das",
    "Das ist nicht",
    "Wir müssen",
    "Wir sollten",
    "Wir können",
    "Wir haben",
    "Wir werden",
    "Ich bin",
    "Sie sind",
    "Er ist",
    "Sie ist",
    "Es ist",
  ];

  // Train bigrams and trigrams
  const bigrams = new Map();
  const trigrams = new Map();
  const unigrams = new Map();
  let total = 0;

  for (const sentence of training) {
    const toks = sentence.toLowerCase().split(/\s+/).filter((t) => t.length > 0);
    for (let i = 0; i < toks.length; i++) {
      unigrams.set(toks[i], (unigrams.get(toks[i]) || 0) + 1);
      total++;
      if (i + 1 < toks.length) {
        const prev = toks[i];
        const next = toks[i + 1];
        if (!bigrams.has(prev)) bigrams.set(prev, new Map());
        const bg = bigrams.get(prev);
        bg.set(next, (bg.get(next) || 0) + 1);
        if (i + 2 < toks.length) {
          const after = toks[i + 2];
          const key = prev + " " + toks[i + 1];
          if (!trigrams.has(key)) trigrams.set(key, new Map());
          trigrams.get(key).set(after, (trigrams.get(key).get(after) || 0) + 1);
        }
      }
    }
  }

  return {
    bigrams: Array.from(bigrams.entries()).map(([k, v]) => [k, Array.from(v.entries())]),
    trigrams: Array.from(trigrams.entries()).map(([k, v]) => [k, Array.from(v.entries())]),
    unigrams: Array.from(unigrams.entries()),
    total,
  };
}

// ============================================================
// Main
// ============================================================
console.log("=== Building English dictionary (with frequencies) ===");
const en = buildEnglish();
writeJson("en.json", en);

console.log("\n=== Building German dictionary (with frequencies) ===");
const de = buildGerman();
writeJson("de.json", de);

console.log("\n=== Building phrase list ===");
const phrases = buildPhrases();
writeJson("phrases.json", phrases);

console.log("\n=== Building n-gram model ===");
const ngrams = buildNgrams();
writeJson("ngrams.json", ngrams);

console.log("\n=== Summary ===");
console.log(`English:    ${en.length} words`);
console.log(`German:     ${de.length} words`);
console.log(`Phrases:    ${phrases.length}`);
console.log(`Bigrams:    ${ngrams.bigrams.length}`);
console.log(`Trigrams:   ${ngrams.trigrams.length}`);
console.log(`Unigrams:   ${ngrams.unigrams.length}`);
console.log("done.");

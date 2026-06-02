#!/usr/bin/env node
/**
 * Build default dictionaries from system word lists.
 * - English: /usr/share/dict/cracklib-small (or words)
 * - German:  flatpak hunspell de_DE_frami.dic (strip flags like /Nm)
 *
 * Output: out/dictionaries/{en,de}.json as flat arrays
 */
const fs = require("fs");
const path = require("path");

// Write to BOTH src/dictionaries/ (for source of truth) and out/dictionaries/ (runtime)
const SRC_DIR = path.join(__dirname, "..", "src", "dictionaries");
const OUT_DIR = path.join(__dirname, "..", "out", "dictionaries");
fs.mkdirSync(SRC_DIR, { recursive: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

const LETTER_ONLY = /^[a-zA-Z]+$/;
const LETTER_UMLAUT = /^[a-zA-ZäöüÄÖÜß]+$/;

function loadEnglish() {
  const sources = [
    "/usr/share/dict/cracklib-small",
    "/usr/share/dict/words",
    "/usr/share/dict/american-english",
  ];
  let words = new Set();
  for (const src of sources) {
    if (fs.existsSync(src)) {
      const lines = fs.readFileSync(src, "utf8").split("\n");
      for (const line of lines) {
        const w = line.trim();
        if (w && LETTER_ONLY.test(w) && w.length >= 2 && w.length <= 30) {
          words.add(w);
        }
      }
      console.log(`[en] ${words.size} words from ${src}`);
      break;
    }
  }
  if (words.size === 0) {
    console.warn("[en] no system dictionary found, using fallback");
    return ["the", "be", "to", "of", "and", "a", "in", "that", "have", "I"];
  }
  return Array.from(words).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

function loadGerman() {
  const sources = [
    "/usr/share/hunspell/de_DE.dic",
    "/usr/share/hunspell/de_DE_frami.dic",
    "/var/lib/flatpak/runtime/org.gnome.Platform.Locale/x86_64/48/8987d720c70ceca711f45c6caf28a479b3a805a25ab7387ccc151085909b4db2-de-en/files/de/share/de/hunspell/de_DE_frami.dic",
  ];
  let words = new Set();
  for (const src of sources) {
    if (fs.existsSync(src)) {
      const lines = fs.readFileSync(src, "utf8").split("\n");
      for (const line of lines) {
        // Skip comments and empty lines
        if (!line || line.startsWith("/") || line.startsWith("#")) continue;
        // Strip flags after / like "Wort/Nm" -> "Wort"
        const slash = line.indexOf("/");
        const w = (slash >= 0 ? line.slice(0, slash) : line).trim();
        if (w && LETTER_UMLAUT.test(w) && w.length >= 2 && w.length <= 30) {
          words.add(w);
        }
      }
      console.log(`[de] ${words.size} words from ${src}`);
      break;
    }
  }
  if (words.size === 0) {
    console.warn("[de] no system dictionary found, using fallback");
    return ["der", "die", "das", "und", "ist", "ein", "eine", "zu", "von", "mit"];
  }
  return Array.from(words).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

function writeJson(filename, data) {
  for (const dir of [SRC_DIR, OUT_DIR]) {
    const file = path.join(dir, filename);
    fs.writeFileSync(file, JSON.stringify(data, null, 0), "utf8");
    console.log(`wrote ${file} (${data.length} words, ${(fs.statSync(file).size / 1024).toFixed(1)} KB)`);
  }
}

const en = loadEnglish();
const de = loadGerman();
writeJson("en.json", en);
writeJson("de.json", de);
console.log("done.");

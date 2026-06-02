/**
 * LanguageDetector - detect the likely language of a word/prefix.
 * Uses simple heuristics:
 * - Presence of umlauts (ä, ö, ü) or ß → German
 * - Common English stopwords
 * - Common German stopwords
 */
const GERMAN_CHARS = /[äöüÄÖÜß]/;
const ENGLISH_STOPWORDS = new Set([
  "the", "be", "to", "of", "and", "a", "in", "that", "have", "i", "it", "for", "not", "on", "with", "he",
  "as", "you", "do", "at", "this", "but", "his", "by", "from", "they", "we", "say", "her", "she", "or",
  "an", "will", "my", "one", "all", "would", "there", "their", "what", "so", "up", "out", "if", "about",
  "who", "get", "which", "go", "me", "when", "make", "can", "like", "time", "no", "just", "him", "know",
  "take", "people", "into", "year", "your", "good", "some", "could", "them", "see", "other", "than", "then",
  "now", "look", "only", "come", "its", "over", "think", "also", "back", "after", "use", "two", "how",
  "our", "work", "first", "well", "way", "even", "new", "want", "because", "any", "these", "give", "day",
  "most", "us",
]);
const GERMAN_STOPWORDS = new Set([
  "der", "die", "das", "und", "ist", "ein", "eine", "zu", "von", "mit", "sich", "auf", "für", "nicht",
  "auch", "dem", "haben", "werden", "wird", "sind", "wir", "sie", "kann", "ich", "ihr", "ihm", "ihn",
  "mir", "mich", "dir", "dich", "du", "er", "es", "man", "aus", "bei", "nach", "wie", "über", "noch",
  "nur", "sehr", "dann", "schon", "kein", "keine", "mehr", "wenn", "aber", "oder", "weil", "hier", "dort",
  "ja", "nein", "bitte", "danke", "hallo", "tschüss",
]);

export type DetectedLanguage = "en" | "de" | "unknown";

export function detectLanguage(word: string): DetectedLanguage {
  if (!word) return "unknown";
  if (GERMAN_CHARS.test(word)) return "de";
  const lower = word.toLowerCase();
  if (ENGLISH_STOPWORDS.has(lower)) return "en";
  if (GERMAN_STOPWORDS.has(lower)) return "de";
  return "unknown";
}

/**
 * Detect language from the whole prefix context (last few words).
 */
export function detectLanguageFromContext(context: string[]): DetectedLanguage {
  if (context.length === 0) return "unknown";
  // Check the last few words
  for (let i = context.length - 1; i >= 0; i--) {
    const lang = detectLanguage(context[i]);
    if (lang !== "unknown") return lang;
  }
  return "unknown";
}

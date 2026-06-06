# Dictionary Autocomplete

A VS Code extension that provides word completions from English and German dictionaries. Type the beginning of any word in any text file and get instant suggestions from a 50k English + 193k German word list.

## Features

- **Drop-in completions** in the standard IntelliSense dropdown
- **English + German** as default languages (50,666 / 193,235 words)
- **Umlauts supported** (ä, ö, ü, ß)
- **Case-insensitive** prefix matching
- **Customizable** word count, minimum prefix length, file types
- **Live reload** when configuration changes
- **Add words** to a user dictionary with a command
- **Status bar** shows loaded word count

## How to use

1. Open any text file (markdown, plaintext, code comments, etc.)
2. Start typing — suggestions appear in the dropdown after 2 characters
3. Use `↑` `↓` to navigate, `Enter` or `Tab` to accept

## Configuration

Open Settings (`Ctrl+,`) and search for "Dictionary Autocomplete":

| Setting | Default | Description |
|---------|---------|-------------|
| `dictionaryAutocomplete.enabled` | `true` | Enable/disable completions |
| `dictionaryAutocomplete.languages` | `["en", "de"]` | Which languages to load |
| `dictionaryAutocomplete.customPaths` | `[]` | Override defaults with custom JSON files |
| `dictionaryAutocomplete.minPrefixLength` | `2` | Minimum prefix length |
| `dictionaryAutocomplete.maxSuggestions` | `20` | Max items in dropdown |
| `dictionaryAutocomplete.fileTypes` | `["*"]` | Where to provide completions |

## Commands

- `Dictionary: Reload dictionaries` — Reload from disk
- `Dictionary: Add current word` — Save the word under the cursor to a user dictionary

## Custom dictionaries

Set `dictionaryAutocomplete.customPaths` to an array of JSON files. Each file can be either a flat array:

```json
["word1", "word2", "word3"]
```

or a language-keyed object:

```json
{
  "de": ["Haus", "Maus"],
  "en": ["house", "mouse"]
}
```

## Build

```bash
npm install
npm run build        # builds dictionaries + compiles TS
npm run watch        # for development
```

The `out/` directory contains the compiled extension and bundled dictionaries.

## Performance

- ~50ms to insert 50k words
- <1ms per prefix lookup (even with 170k+ words)
- Provider runs on every keystroke — works smoothly

## File layout

```
src/
  extension.ts          - entry point
  Trie.ts               - prefix tree
  DictionaryLoader.ts   - loads JSON files
  DictionaryProvider.ts - VSCode completion provider
  dictionaries/         - default word lists
    en.json
    de.json
scripts/
  build-dicts.js        - generates dicts from system word lists
  smoke-test.js         - quick correctness check
  integration-test.js   - full end-to-end check
```

## License

MIT

---

## Hinweis zur KI-Unterstützung

Bei der Entwicklung dieses Projekts wurden teilweise oder vollständig KI-gestützte Tools und Technologien eingesetzt.
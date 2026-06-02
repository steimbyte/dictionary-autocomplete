 📋 PLAN (v2): Dictionary Autocomplete via Dropdown

 Ziel

 VSCode-Extension, die Wörter aus JSON-Wörterbüchern im normalen IntelliSense-Dropdown (das, was beim Tippen aufklappt) vorschlägt
 - mit Filterung während des Tippens.

 Architektur (vereinfacht!)

 ```
   User tippt "Schme"
       ↓
   VSCode ruft provideCompletionItems() auf
       ↓
   Trie.suggestions("Schme", limit=20)
       ↓
   ["Schmetterling", "Schmerz", "Schmelz", ...]
       ↓
   VSCode zeigt Dropdown mit allen Treffern
       ↓
   User wählt → CompletionItem mit .insertText und .range
 ```

 Tech Stack

 - TypeScript + vsce (Standard VSCode Build)
 - API: vscode.languages.registerCompletionItemProvider
 - JSON-Parser: jsonc-parser (VSCode-eigenes Package, erlaubt Kommentare)
 - Datenstruktur: Trie für schnelle Prefix-Suche + Map<string, CompletionItem[]> als Cache

 Kernkomponenten (5 Dateien)

 ### 1. extension.ts (Entry)

 ```typescript
   export function activate(context) {
     const loader = new DictionaryLoader();
     const provider = new DictionaryProvider(loader);

     context.subscriptions.push(
       vscode.languages.registerCompletionItemProvider(
         ['markdown', 'plaintext', '*'],
         provider,
         ...'abcdefghijklmnopqrstuvwxyzäöüß'.split('')  // Trigger bei jedem Buchstabe
       )
     );
   }
 ```

 ### 2. DictionaryLoader.ts

 - Lädt JSON-Dateien aus Settings
 - Lädt beim activate() und neu bei File-Change (Watcher)
 - Format: {"de": ["wort1", "wort2"], "en": ["word1"]}

 ### 3. DictionaryProvider.ts (das Herzstück)

 ```typescript
   class DictionaryProvider implements vscode.CompletionItemProvider {
     provideCompletionItems(document, position) {
       const wordRange = getWordRange(document, position);
       const prefix = document.getText(wordRange);
       if (prefix.length < 1) return [];

       const words = this.trie.suggestions(prefix, 50);
       return words.map(w => ({
         label: w,
         insertText: w,
         kind: vscode.CompletionItemKind.Text,
         range: wordRange  // WICHTIG: damit beim JSON der ganze String ersetzt wird
       }));
     }
   }
 ```

 ### 4. Trie.ts

 - Standard Prefix-Trie
 - insert(word: string), suggestions(prefix: string, limit: number): string[]
 - Optional: Frequenz-Tracking für bessere Sortierung

 ### 5. package.json Konfiguration

 ```json
   "contributes": {
     "configuration": {
       "properties": {
         "dictionaryAutocomplete.paths": {
           "type": "array",
           "default": []
         },
         "dictionaryAutocomplete.minWordLength": {
           "type": "number",
           "default": 3
         }
       }
     }
   }
 ```

 Wichtige Erkenntnisse aus der Recherche

 ┌──────────────────────┬────────────────────────────────────────────────────────────────────────────────────────────────────────┐
 │ Thema                │ Erkenntnis                                                                                             │
 ├──────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────┤
 │ Provider-Blockierung │ Wenn man viele triggerCharacters registriert, werden andere Provider (z.B. eingebaute                  │
 │                      │ Word-Suggestions) ggf. übersprungen - Selector möglichst spezifisch halten                             │
 ├──────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────┤
 │ JSON-Files           │ In JSON ist der "current word range" = der ganze String - deshalb immer explizit range im              │
 │                      │ CompletionItem setzen                                                                                  │
 ├──────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────┤
 │ Performance          │ Provider läuft bei jedem Tastenanschlag - minWordLength Check früh machen                              │
 ├──────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────┤
 │ Selector-Reihenfolge │ Spezifischere Sprach-IDs vor * setzen, sonst greift * immer                                            │
 └──────────────────────┴────────────────────────────────────────────────────────────────────────────────────────────────────────┘

 Phasen-Plan

 ### Phase 1: MVP (~1 Tag)

 - [ ] npm install -g yo generator-code und yo code für Skeleton
 - [ ] Trie.ts schreiben
 - [ ] DictionaryLoader.ts mit hartkodiertem Test-Pfad
 - [ ] DictionaryProvider.ts implementieren
 - [ ] Test in .md und .txt Datei

 ### Phase 2: Konfiguration (~0.5 Tage)

 - [ ] Settings in package.json
 - [ ] File Watcher für Live-Reload
 - [ ] Command dictionary.addCurrentWord

 ### Phase 3: Polish (~0.5 Tage)

 - [ ] README + Screenshots
 - [ ] Status-Bar Anzeige (Wortanzahl)
 - [ ] Snippet-style für lange Wörter

 Offene Fragen vor Implementation

 1. Welche Sprachen/Dateitypen? (markdown, plaintext, alle Textdateien?)
 2. Wo soll deine Wörterbuch-JSON liegen? (Standard: ~/.config/dict/{de,en}.json?)
 3. Wie strukturierst du die JSON? Ein Wort pro Zeile, oder Array? Beides geht.

 Vergleich: Ghost Text vs. Dropdown

 ┌─────────────────────────────┬──────────────────────┬────────────────────────┐
 │ Feature                     │ Inline (Ghost Text)  │ Dropdown (unser Plan)  │
 ├─────────────────────────────┼──────────────────────┼────────────────────────┤
 │ Mehrere Vorschläge sichtbar │ ❌ nur 1             │ ✅ alle                │
 ├─────────────────────────────┼──────────────────────┼────────────────────────┤
 │ User-Auswahl nötig          │ ❌ Tab reicht        │ ✅ Klick/Pfeiltasten   │
 ├─────────────────────────────┼──────────────────────┼────────────────────────┤
 │ Visueller Overhead          │ ✅ kaum              │ ⚠️ Dropdown klappt auf │
 ├─────────────────────────────┼──────────────────────┼────────────────────────┤
 │ Beste für                   │ kurze häufige Wörter │ lange Wörter, Auswahl  │
 └─────────────────────────────┴──────────────────────┴────────────────────────┘

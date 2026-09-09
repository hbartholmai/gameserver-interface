# Ein weiteres Spiel ergänzen

Im Normalfall reichen zwei Dateien: eine neue Vorlage und ein Eintrag in der
Liste. Ein eigener Adapter ist nur nötig, wenn das Spiel ein Protokoll spricht,
das noch niemand nutzt.

## 1. Vorher klären

Diese vier Fragen entscheiden über `capabilities` — und sie sind die
Hauptquelle für falsche Annahmen. Die Antworten gehören belegt, nicht geraten.

| Frage | Wirkt auf |
| --- | --- |
| Nimmt der Server Befehle entgegen (RCON, stdin)? | `console: 'rcon' \| 'readonly'` |
| Woher kommt die Spielerliste — RCON, Steam-Query, nur Log? | `players` |
| Gibt es serverseitiges Kick/Bann? | `moderation` |
| Unterstützt das Spiel Mods, und wo liegen sie? | `mods`, `modsPath`, `modExtensions` |

Dazu: Welche Ports, welche Volumes, welche Umgebungsvariablen dokumentiert das
gewählte Image, und woran erkennt man im Log, dass der Server hochgefahren ist?

## 2. Spiel-ID aufnehmen

`packages/shared/src/schema/common.ts`:

```ts
export const gameIdSchema = z.enum(['minecraft', 'valheim', 'enshrouded', 'neuesspiel']);
```

Der Compiler zeigt danach alle Stellen, die vollständig sein müssen —
`TEMPLATES` und `ADAPTERS` sind `Record<GameId, …>`.

## 3. Vorlage schreiben

`packages/shared/src/templates/neuesspiel.ts`. Als Muster eignet sich
`valheim.ts` (mittlerer Funktionsumfang) besser als `minecraft.ts` (Sonderfall
mit RCON).

Worauf zu achten ist:

- **`fields`** — `editable: false` für alles, was nach dem Anlegen nicht mehr
  änderbar ist (Weltname, Seed). `secret: true` für Passwörter; die werden in
  der API maskiert. `help` erklärt Grenzen des Spiels, keine Selbstverständ­lichkeiten.
- **`ports`** — `internalOnly: true` für Ports, die nicht auf dem Host landen
  sollen (RCON). Der `defaultHost` ist nur ein Vorschlag; der Wizard sucht bei
  Kollision den nächsten freien Port.
- **`env(values, ctx)`** — Host-Ports kommen aus `ctx.hostPorts`, nicht aus den
  Feldwerten. Leere optionale Werte weglassen statt als leeren String zu setzen.
- **`logPatterns.join`** — Gruppe 1 muss der Spielername sein. Gibt es kein
  Abgangsmuster, `leave` weglassen und in `capabilities.players` etwas wählen,
  das eine Zählung liefert (`a2s`), sonst bleiben Spieler in der Liste stehen.
- **`backup.paths`** — nur Pfade innerhalb der deklarierten `volumes`; ein Test
  prüft das. `preCommands` nur, wenn `console: 'rcon'` — ebenfalls getestet.

Registrieren in `packages/shared/src/templates/index.ts` (`TEMPLATES`,
`TEMPLATE_LIST`, Re-Export).

Spielspezifische Prüfungen, die sich nicht aus den Feld-Specs ergeben — etwa
Mindestlängen von Passwörtern —, kommen in `validateSettings()` in derselben
Datei.

## 4. Adapter

Bei `console: 'readonly'` und `players: 'log'` genügt eine Kopie von
`games/enshrouded.ts`: `probe()` liest aus `ctx.logPlayers`, alles Schreibende
wirft `UnsupportedError` mit einem Satz, der erklärt **warum** — dieser Text
erscheint in der Oberfläche.

Nutzt das Spiel Steam-Query, lässt sich `queryA2sInfo()` aus `util/a2s.ts`
direkt verwenden (siehe `games/valheim.ts`).

Registrieren in `packages/server/src/games/index.ts`.

## 5. Fake-Runtime lehren

`FORMATTERS` in `packages/server/src/runtime/fake.ts` um einen Eintrag unter der
neuen Spiel-ID erweitern, der Zeilen **im echten Format des Spiels** erzeugt.

Das ist keine Kür: Die Simulation ist die einzige Stelle, an der die Parser
ohne echten Server geprüft werden. Wunschformat hier bedeutet, dass die Tests
grün sind und die Produktion nicht funktioniert.

## 6. Tests

In `packages/shared/src/templates/` gibt es zwei Suiten, die neue Vorlagen
automatisch erfassen, weil sie über `TEMPLATE_LIST` laufen: Eindeutigkeit von
Feld- und Port-Namen, Mod-Pfad passend zu `capabilities.mods`, Backup-Pfade
innerhalb der Volumes, Vorbefehle nur mit RCON, gültige Standardwerte.

Selbst zu ergänzen sind:

- `logparser.test.ts` — Beitritt, Abgang, Startmeldung, Zeitstempel-Entfernung
  an echten Beispielzeilen aus dem Log des Spiels.
- `templates.test.ts` — die Env-Abbildung, besonders Sonderfälle wie
  weggelassene Werte.

## 7. Prüfen

```bash
npm run build -w @gsp/shared && npm run typecheck && npm test
```

Danach mit der Fake-Runtime durch die Oberfläche:

```bash
npm run build
GSP_RUNTIME=fake GSP_DATA_DIR=/tmp/gsp-neu GSP_WEB_ROOT=$PWD/packages/web/dist \
  node packages/server/dist/index.js
```

Instanz über den Wizard anlegen und prüfen: Erreicht sie `Online` (greift das
`ready`-Muster?), erscheinen im Konsolen-Reiter geparste Zeilen, tauchen Spieler
in der Liste auf, blendet die UI die richtigen Bedienelemente aus?

Ein Test gegen den echten Container bleibt Sache einer Maschine mit
Docker-Daemon — das im Bericht so benennen.

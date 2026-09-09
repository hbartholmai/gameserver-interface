# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Projektsprache ist **Deutsch**: Bezeichner, Kommentare, UI-Texte, Commit-Nachrichten und Dokumentation sind auf Deutsch. Nur etablierte englische Fachbegriffe bleiben stehen (`Runtime`, `Backup`, `Job`, `Container`). Schemas und Typen in `@gsp/shared` nutzen englische Feldnamen, weil sie die API-Oberfläche bilden — die Anzeige übersetzt.

## Befehle

```bash
npm install                    # einmalig, npm workspaces
npm run build -w @gsp/shared   # muss vor server/web laufen, wenn Schemas geändert wurden

npm run build                  # alle Pakete
npm run rebuild                # clean + build, bei rätselhaften Typfehlern
npm run typecheck              # alle Pakete
npm test                       # Vitest über alle Pakete
```

Ein Linter ist nicht eingerichtet. Formatierung und Stil richten sich nach dem
umliegenden Code; `npm run typecheck` läuft im `strict`-Modus mit
`noUncheckedIndexedAccess`.

Einzelne Tests:

```bash
npx vitest run packages/server/src/services/paths.test.ts
npx vitest run -t "lehnt zu kurze Valheim-Passwörter ab"
npx vitest                     # Watch-Modus
```

Anwendung lokal, **ohne Docker**:

```bash
GSP_RUNTIME=fake npm run dev   # Backend :8770, Frontend :5273 mit Proxy
```

Oder gegen den Produktionsbuild:

```bash
npm run build
GSP_RUNTIME=fake GSP_DATA_DIR=/tmp/gsp GSP_WEB_ROOT=$PWD/packages/web/dist \
  node packages/server/dist/index.js
```

## Architektur

Drei Pakete, npm workspaces:

- **`packages/shared`** (`@gsp/shared`) — Zod-Schemas für REST und WebSocket, Formatierung und die **Spielvorlagen**. Wird von Backend *und* Frontend importiert; Änderungen hier erfordern `npm run build -w @gsp/shared`, sonst sehen die anderen Pakete alte Typen.
- **`packages/server`** (`@gsp/server`) — Fastify.
- **`packages/web`** (`@gsp/web`) — React, Vite, CSS Custom Properties.

### Vorlagen sind der zentrale Erweiterungspunkt

Eine Vorlage in `packages/shared/src/templates/` beschreibt deklarativ Image, Ports, Volumes, Formularfelder, Env-Abbildung, Fähigkeiten, Log-Muster und Backup-Pfade. Daraus entstehen **Anlege-Wizard, Config-Reiter und Container** — ein weiteres Spiel braucht im Normalfall nur eine neue Datei plus Eintrag in `templates/index.ts`. Siehe `docs/vorlage-hinzufuegen.md`.

`GameTemplate` enthält Funktionen und RegExp und ist damit nicht serialisierbar. `toDescriptor()` schneidet den JSON-fähigen Teil heraus — nur der geht über `GET /api/templates` ans Frontend.

### Fähigkeiten statt Annahmen

Der Design-Prototyp nimmt an, dass jede Instanz eine Befehlseingabe und Mods hat. Real gilt das nur für Minecraft. `capabilities` je Vorlage steuert, was die UI zeigt:

| | `console` | `players` | `moderation` | `mods` |
| --- | --- | --- | --- | --- |
| Minecraft | `rcon` | `rcon` | ja | `plugins` |
| Valheim | `readonly` | `a2s` | nein | `bepinex` |
| Enshrouded | `readonly` | `log` | nein | `none` |

**Neue Bedienelemente immer gegen `capabilities` prüfen, nie gegen `game === '…'`.** Adapter werfen `UnsupportedError`, wenn etwas nicht geht; die Route beantwortet das mit 400 statt 502.

### Schichten im Backend

```
routes/          REST + WebSocket, dünn — nur Validierung und Weiterleitung
services/        Geschäftslogik
  instances.ts   zentral: Lebenszyklus, Statusableitung, DTO-Aufbau
  ticker.ts      Messtakt, verteilt Schnappschüsse an WebSocket-Abonnenten
  logs.ts        Log-Stream, Zeileneinstufung, Spieler-Tracking
  jobs.ts        langlaufende Aktionen mit Fortschritt
games/           pro Spiel ein Adapter (RCON, A2S, Log)
runtime/         Container-Abstraktion: DockerRuntime | FakeRuntime
db/              SQLite, handgeschriebenes SQL, Migrationen in db/index.ts
```

Der Datenfluss zur UI: `Ticker` misst im Takt von `GSP_REFRESH_MS`, schickt einen Schnappschuss über `Hub` an das Thema `metrics`. Die Instanzliste selbst kommt per REST; die WebSocket **patcht** nur die veränderlichen Felder in den vorhandenen Zustand. Strukturänderungen lösen `instances-changed` aus, worauf das Frontend neu lädt.

### FakeRuntime

`GSP_RUNTIME=fake` ersetzt Docker durch eine Simulation im Speicher — Test-Double *und* Entwicklungsmodus. Sie erzeugt Logzeilen im **echten Format** der jeweiligen Spiele, damit dieselben Parser laufen wie in Produktion. Wer ein Log-Muster ändert, muss auch `FORMATTERS` in `runtime/fake.ts` anpassen, sonst testet man an der Realität vorbei.

Die Fake-Laufzeit hält Container nur im Speicher: Nach einem Neustart des Panels fehlen sie, die Instanzen gehen auf `Fehler`. Das ist gewollt — `start()` erzeugt einen fehlenden Container aus der gespeicherten Konfiguration neu.

### Volumes sind Bind-Mounts

Instanzdaten liegen unter `GSP_DATA_DIR/instances/<id>/<volume>`. Backups und Mod-Verwaltung arbeiten deshalb direkt auf Host-Pfaden statt durch den Container zu streamen.

**Fallstrick:** Läuft das Panel selbst im Container, erzeugt trotzdem der Docker-Daemon des *Hosts* die Instanz-Container und löst Bind-Mounts aus **seiner** Sicht auf. Dafür gibt es `GSP_HOST_DATA_DIR`. Wer an `createContainer()` arbeitet: Verzeichnisse lokal anlegen (`config.volumeDir`), Mounts mit `config.hostVolumeDir` eintragen.

### Design-Treue

`design_handoff_gameserver_panel/` ist die Referenz — maßgeblich ist `Gameserver Verwaltung v2.dc.html` (dunkel), die helle v1 ist nur Referenz und wird **nicht** umgesetzt. `support.js` ist Prototyping-Laufzeit und wird nicht übernommen.

Farben, Typografie und Abstände liegen als Custom Properties in `packages/web/src/styles/tokens.css`. **Keine Farbwerte direkt in Komponenten schreiben.** Zum Look gehören: `border-radius: 0` überall, keine Schatten, Tiefe entsteht über Flächenhelligkeit. Die einzige Animation ist der pulsierende Statuspunkt im Detailkopf.

Zahlen werden über `@gsp/shared/format` deutsch formatiert (`5,4 GB`, `71 h 30 m`). Das Backend liefert rohe Zahlen, die Darstellung entsteht im Frontend.

## Fallstricke

- **Der Build-Kontext muss sauber sein.** Ohne `.dockerignore` kopiert `COPY . .`
  das Host-`node_modules` und die `dist/`-Verzeichnisse über das, was `npm ci`
  und `npm run build` im Image gerade erst erzeugt haben: die mitgereiste
  `dist/.tsbuildinfo` lässt tsc nichts emittieren, die Windows-Junctions der
  Workspaces zerbrechen die Auflösung von `@gsp/shared`, und BuildKit scheitert
  auf Windows schon beim Laden des Kontexts („unknown file mode"). Neue Ordner
  mit erzeugten Dateien gehören in `.dockerignore`, nicht nur in `.gitignore`.
- **`GSP_DATA_DIR` wird vom Docker-Daemon aufgelöst, nicht vom Panel.** Unter
  Docker Desktop für Windows liegt der Daemon in einer Linux-VM; ein Pfad wie
  `D:\ServerTest` wird dort zu `/app/D:ServerTest`. Richtig ist
  `/run/desktop/mnt/host/d/ServerTest` — siehe README, Abschnitt Einstellungen.
- **`npm run build -w @gsp/shared` vergessen** ist die häufigste Ursache für „Cannot find module '@gsp/shared'" oder implizite `any` im Web-Paket.
- **Container-Umgebungen sind unveränderlich.** Geänderte Einstellungen wirken erst nach `recreate()` — stoppen, entfernen, neu erstellen. Weltdaten überleben das, weil sie in Bind-Mounts liegen.
- **Geheimnisse maskieren.** `maskSecrets()` ersetzt Werte von Feldern mit `secret: true` durch `********`. Der Config-Reiter schickt unveränderte Geheimnisse nicht mit zurück, sonst würde die Maske als neues Passwort gespeichert.
- **`pkill -f` trifft die eigene Shell**, wenn das Muster im Kommando vorkommt. Prozesse über eine PID-Datei beenden oder `/proc/<pid>/cmdline` prüfen.
- Playwright: Die vorinstallierte Chromium-Version passt nicht zu einer frisch installierten Playwright-Version. `chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })` benutzen, **nicht** `playwright install`.

## Verifikation

Ohne Docker prüfbar und vor jedem Commit erwartet:

```bash
npm run rebuild && npm run typecheck && npm test
```

Für Änderungen an der Oberfläche zusätzlich ein Durchlauf mit Playwright gegen `GSP_RUNTIME=fake` — anmelden, Instanz über den Wizard anlegen, Reiter durchklicken, Screenshots ansehen. Ein Vorgehen dafür steht in `docs/entwicklungsprotokoll.md`.

Echte Docker-Container lassen sich in dieser Umgebung **nicht** prüfen (kein Daemon). Was auf einer Maschine mit Docker zu testen ist, steht im README unter „Schnellstart"; solche Punkte im Bericht ausdrücklich als ungeprüft kennzeichnen.

## Weiterführend

- `README.md` — Betrieb, Einstellungen, Sicherheit
- `docs/architektur.md` — Entscheidungen und ihre Begründung
- `docs/vorlage-hinzufuegen.md` — neues Spiel ergänzen
- `docs/entwicklungsprotokoll.md` — ursprünglicher Plan, Abweichungen, gefundene Fehler

# Entwicklungsprotokoll

Wie das Panel entstanden ist, was dabei schiefging und wie es geprüft wurde.
Für künftige Agenten vor allem interessant: **Abschnitt 3** — jeder dort
genannte Fehler wurde erst beim Prüfen sichtbar, nicht beim Schreiben.

## 1. Ursprünglicher Plan

Vor der Umsetzung wurden vier Weichenstellungen mit dem Auftraggeber geklärt
(Docker-Runtime, TypeScript-Monorepo, vollständige Vertikale, ein Admin-Login).
Die Begründungen stehen in `architektur.md`.

Umsetzungsreihenfolge:

1. Monorepo-Gerüst, `shared`-Schemas, Design-Tokens, Basis-Komponenten
2. Backend-Kern: DB, Auth, `Runtime` mit Docker- und Fake-Implementierung
3. Spiel-Adapter, Dienste, REST und WebSocket
4. Frontend-Shell gegen die echte API
5. Die sechs Reiter
6. Anlege-Wizard, Instanz löschen, Fehlerzustände
7. Tests, Deployment, README

Die Reihenfolge hat sich bewährt. Wichtig war, das Backend nach Schritt 3 per
`curl` durchzuspielen, statt bis zur fertigen Oberfläche zu warten — Anlegen,
Port-Kollision, Validierung, Backup und Wiederherstellung ließen sich so früh
absichern.

## 2. Recherche, die den Entwurf verändert hat

Die Fähigkeiten der drei Spiele wurden **vor** dem Schreiben der Vorlagen
geprüft, nicht aus dem Gedächtnis angenommen. Drei Ergebnisse haben den Entwurf
verändert:

- Valheim hat kein RCON. Der Prototyp zeigt überall eine Befehlseingabe — daraus
  wurde das `capabilities`-Konzept.
- Enshrouded hat `SERVER_PASSWORD` abgekündigt und arbeitet mit Server-Rollen;
  außerdem gibt es nur noch einen Port statt der früher üblichen zwei. Eine
  erste Fassung der Vorlage war deshalb falsch und wurde korrigiert.
- Node 22 bringt zstd in `node:zlib` mit. Damit entstehen die `.tar.zst`-Dateien
  aus dem Design ohne externes Binary.

**Merke:** Env-Variablennamen und Portbelegungen der Community-Images gehören
belegt. Erfundene Namen fallen erst auf der Zielmaschine auf, wo niemand mehr
nachsehen kann, was gemeint war.

## 3. Fehler, die erst die Verifikation zeigte

### Sidebar: „VALHEIMMIDGARD"

Spielname und Instanzname standen auf einer Zeile. `<span>`-Elemente in einem
`<span>` bleiben inline, auch wenn die Klasse Blockeigenschaften suggeriert.
Sichtbar nur im Screenshot, nicht im Code.

### „— vCPU" statt „4 vCPU"

Das DTO wurde um `cpus` erweitert, der laufende Server lief aber noch aus einem
älteren `dist`. **Nach jeder Schema-Änderung neu bauen, bevor man das Ergebnis
beurteilt** — sonst misstraut man dem falschen Code.

### Status blieb dauerhaft auf „Startet"

`LogService.attach()` prüfte das Abbruchsignal, um doppeltes Lesen zu
verhindern. Ein Stream kann aber von sich aus enden — etwa weil der Container
fehlte — **ohne** dass abgebrochen wurde. Danach verweigerte `attach()` die
Wiederaufnahme, die Startmeldung kam nie an, der Status hing fest. Behoben mit
einem expliziten `active`-Kennzeichen.

Aufgefallen ist das nur, weil die Fake-Runtime ihre Container beim Neustart des
Panels verliert und der Ablauf dadurch zufällig durchgespielt wurde.

### `slug('Größe')` ergab „grosse" statt „groesse"

`normalize('NFKD')` zerlegt „ö" in „o" plus kombinierendes Trema; das
anschließende Entfernen der Diakritika ließ nur „o" übrig, sodass die
Ersetzung `ö → oe` nie griff. **Umlaut-Ersetzung muss vor der Normalisierung
stehen.** Gefunden durch einen Test, der einen Umlaut enthielt — die
naheliegenden Beispiele ohne Umlaut wären durchgelaufen.

### `rm -rf dist && npm run build` erzeugte nichts

Bei `composite: true` schreibt tsc eine `tsconfig.tsbuildinfo` **neben** die
tsconfig. Wird `dist` gelöscht, hält tsc den Stand weiter für aktuell und
emittiert nichts — anschließend scheitern Server, Web und Tests mit „Cannot find
module '@gsp/shared'". Behoben mit `tsBuildInfoFile: "./dist/.tsbuildinfo"` und
einem `clean`-Skript.

Gefunden erst beim abschließenden sauberen Rebuild. **Ein sauberer Build vor dem
Commit ist kein Ritual.**

### Kompilierte Dateien im Quellbaum

Das Web-Paket hatte `tsc -b` mit Emit im `build`-Skript; dabei entstanden
`.js`- und `.js.map`-Dateien neben den `.tsx`-Quellen und landeten im ersten
Commit. Behoben: `--noEmit`, Dateien entfernt, Muster in `.gitignore`.

### Compose wäre auf der Zielmaschine kaputt gewesen

Läuft das Panel im Container, erzeugt trotzdem der Docker-Daemon des **Hosts**
die Instanz-Container und löst Bind-Mounts aus seiner Sicht auf. Mit
`./data:/data` hätte der Daemon `/data/instances/<id>` auf dem Host angelegt —
die Instanzen hätten ins Leere gemountet. Dafür gibt es jetzt
`GSP_HOST_DATA_DIR`.

Aufgefallen beim Schreiben des Compose-Files, nicht durch einen Test. Solche
Fehler findet nur, wer den Betriebsweg gedanklich durchgeht.

## 4. Prüfvorgehen

### Ohne Docker

```bash
npm run rebuild && npm run typecheck && npm test
```

80 Tests: Vorlagen und ihre Env-Abbildung, Log-Parser aller drei Spiele,
Docker-Stream-Demultiplexing, Pfad-Traversal-Schutz, Passwort-Hashing,
Formatierung, Backup-Zeitpläne, plus ein API-Volldurchlauf gegen die
Fake-Runtime (`app.test.ts`: anlegen, Port-Kollision, Maskierung, Konsole,
Backup mit Wiederherstellung, Einstellungen, löschen).

### Oberfläche

Chromium ist vorinstalliert. Die passende Playwright-Version ist es **nicht** —
deshalb `executablePath` setzen statt `playwright install` zu rufen:

```js
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('SEITENFEHLER:', e.message));
```

Das Skript muss **im Repo** liegen, sonst findet Node `playwright` nicht.
Ablauf: Ersteinrichtung, Instanz über den Wizard anlegen, auf `ONLINE` warten,
Reiter durchklicken, `fullPage`-Screenshots ansehen.

Zwei Konsolenmeldungen sind erwartbar und **kein** Fehler: 401 beim Prüfen einer
noch nicht bestehenden Sitzung, 502 bei einem RCON-Befehl gegen die
Fake-Runtime (es gibt dort keinen RCON-Server).

### Was hier nicht prüfbar ist

Echte Docker-Container — es gibt keinen Daemon. Ungeprüft bleiben damit: die
Env-Variablen gegen die tatsächlichen Images, Enshrouded unter Wine, die
Aktualisierung per Image-Pull, RCON gegen einen echten Minecraft-Server und die
Bind-Mount-Auflösung im Compose-Betrieb. Diese Punkte gehören in jedem Bericht
ausdrücklich als ungeprüft benannt.

## 5. Wiederkehrende Stolpersteine der Umgebung

- `pkill -f "muster"` beendet die eigene Shell, wenn das Muster im
  Kommando vorkommt (Exit 144). PID-Datei benutzen oder
  `/proc/<pid>/cmdline` prüfen.
- `tsc` bevorzugt `foo.ts` vor `foo.d.ts` bei gleichem Basisnamen. Eine
  Modul-Augmentierung in `fastify.d.ts` wird von einer `fastify.ts` daneben
  unsichtbar gemacht — deshalb liegt sie in `src/types/augmentations.d.ts`.
- Für Fastify-Plugins muss das Paket importiert werden, damit die
  Typerweiterung greift (`import '@fastify/cookie'`), auch wenn der Import
  sonst ungenutzt aussieht.

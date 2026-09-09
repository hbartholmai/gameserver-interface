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

## 3a. Umbau: Vorlagen als Daten (nachgereicht)

Zwei Wünsche führten zu einem größeren Umbau: Vorlagen sollten zur Laufzeit
anlegbar und editierbar sein, und der Aufbau einer Instanz verfolgbar. Was dabei
auffiel:

### Der Fortschritt wurde gemessen und weggeworfen

`services/instances.ts` meldete den Anlege-Fortschritt vollständig — Pull mit
echten Layer-Bytes, Container erstellen, starten — und schickte ihn über
`TOPIC.jobs`. `App.tsx` filterte alles außer `status === 'failed'` heraus, und
der Wizard nahm aus der Antwort nur die ID. Der aufwendige Teil war fertig, der
billige fehlte.

**Merke:** Bevor man eine Messung baut, nachsehen, ob sie schon da ist und nur
niemand zuhört.

### Für die zweite Hälfte gibt es keinen ehrlichen Prozentsatz

Der Job ist bei 100 %, sobald der *Container* läuft. Der *Server* fängt dann
erst an, seine Welt zu erzeugen — bei Minecraft und Valheim Minuten. Ein Balken
dafür wäre erfunden gewesen. Stattdessen: verstrichene Zeit, die Dauer des
letzten Starts (neue Spalte `last_boot_sec`, je Instanz statt je Vorlage, weil
eine wachsende Welt länger braucht) und der mitlaufende Log-Strom.

### Eine tote CSS-Regel unter demselben Namen

Der Aufbaudialog fiel auf 200 px zusammen, die Fußzeile überlappte den Inhalt.
Ursache war eine bereits vorhandene, **von keiner Komponente benutzte** Regel
`.fortschritt { height: 4px }` in `tabs.css` — ein Rest aus dem ursprünglichen
Bau, der die neue Definition überschrieb. Gefunden nur, weil die Geometrie
gemessen wurde statt das CSS gelesen.

### „Container fehlt" als Aufbaufortschritt

Während des Image-Pulls existiert der Container noch nicht, die Instanz meldet
also korrekterweise `Fehler`. Im Aufbaudialog gelesen stand dort „Container
fehlt — Starten erzeugt ihn neu", was alarmierend wirkt, obwohl alles seinen
Gang geht. Ein laufender Job hat jetzt Vorrang vor dem Instanzstatus.

### Der Migrationstest war die eigentliche Arbeit

Beim Umbau der Vorlagen von Code zu Daten lag das Risiko nicht im neuen Schema,
sondern in den Feinheiten der alten `env()`-Funktionen: `?? '…'`-Vorgaben, der
Unterschied zwischen `x ?` und `x === false ?`, das Trimmen des Seeds, die
weggelassenen Variablen. `migration.test.ts` hält die alten Funktionen wortgleich
fest und vergleicht sie über mehrere Wertesätze — Standardwerte, alle Booleans
invertiert, alles leer, gar nichts gesetzt.

**Ohne diesen Test wäre der Umbau nicht verantwortbar gewesen.** Ein falsch
übersetztes `SERVER_PUBLIC` fällt sonst erst auf, wenn ein Server nicht mehr in
der Liste erscheint.

### Beispielzeilen, die zu keinem Muster passen

Beim Schreiben der Routentests bekam die Testvorlage keine `fakeLog`-Angabe. Die
Fake-Runtime erzeugte daraufhin generische Zeilen, die zum `ready`-Muster der
Vorlage nicht passten — die Instanz blieb für immer auf „Startet", und der Test
lief in seinen Timeout.

Das ist derselbe Fallstrick, vor dem `CLAUDE.md` für `FORMATTERS` in
`runtime/fake.ts` warnte, nur aus der anderen Richtung. Jetzt prüft der
Vorlagendienst beim Speichern, dass die Beispielzeilen zu den Mustern derselben
Vorlage passen, und ein Test tut dasselbe für die mitgelieferten. Der Merksatz
ist damit erledigt.

### Der Editor war 12.131 Pixel hoch

Mit allen Abschnitten offen war er für Valheim (8 Felder, 11 Variablen)
unbenutzbar. Sichtbar wurde das erst im Screenshot; im Code sieht ein Formular
mit vielen Abschnitten unauffällig aus. Aufklappbare Abschnitte mit Anzahl im
Kopf: 1.190 px.

**Merke:** Bei generierten Formularen nicht die Komponente ansehen, sondern die
Höhe messen — mit echten Daten, nicht mit einem Beispiel.

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

### Der KI-Vorlagenentwurf

**Der Anbieter wurde nachträglich gewechselt.** Zuerst gebaut mit der
Anthropic-API, dann auf Google Gemini umgestellt — nicht aus technischen
Gründen, sondern weil ein kostenpflichtiger Zugang für ein Feature, das ein
Betreiber vielleicht drei Mal im Jahr benutzt, eine unverhältnismäßige Hürde
ist. Der Knopf erscheint ohne Schlüssel gar nicht, das Feature wäre für die
meisten unsichtbar geblieben.

Gemini, weil sein kostenloses Kontingent **beide** benötigten Fähigkeiten
mitbringt: die Google-Suche als Werkzeug und eine gegen ein JSON-Schema
erzwungene Ausgabe. Freie Modelle bei OpenRouter, Groq oder Mistral haben keine
eingebaute Websuche; dort hätte die Recherche neu gebaut werden müssen — und
ohne Recherche erfindet ein Modell Variablennamen, was genau der Fehler ist,
vor dem Abschnitt 2 warnt.

Zwei Aufrufe statt einem: erst Recherche mit Google-Suche und freiem Text, dann
Formen ohne Werkzeuge gegen ein JSON-Schema.

**Die Begründung dafür hat sich mit dem Wechsel geändert**, die Trennung nicht.
Bei Anthropic war sie erzwungen: strukturierte Ausgaben vertragen sich dort
nicht mit Zitaten. Gemini kann beides in einem Aufruf. Geblieben ist sie
trotzdem, weil der erste Aufruf die Belege als **lesbaren Text** liefert; ein
einzelner Aufruf gäbe nur Quell-URLs zurück, und man müsste jede öffnen, statt
„`SERVER_PASS` setzt das Passwort, laut …" direkt zu lesen. Die Prüfbarkeit ist
der Zweck der ganzen Übung.

**Merke:** Wenn eine Entwurfsentscheidung ihre ursprüngliche Begründung verliert,
gehört sie neu begründet oder rückgängig gemacht — nicht mit einer Erklärung
stehengelassen, die nicht mehr stimmt.

Das Ausgabeschema ist von Hand geschrieben, nicht aus dem Zod-Schema erzeugt:
das Definitionsschema arbeitet mit `.default()`, was für strukturierte Ausgaben
ungünstig ist, weil das Modell Optionales gern weglässt. Im Entwurfsschema ist
deshalb alles verlangt, „nicht vorhanden" ist `null` und wird danach entfernt.
Geprüft: Gemini unterstützt `anyOf`, `enum`, `required`, `additionalProperties`
und `type: ["string", "null"]`, also blieb das Schema beim Wechsel unverändert.

### Was hier nicht prüfbar ist

Echte Docker-Container — es gibt keinen Daemon. Ungeprüft bleiben damit: die
Env-Variablen gegen die tatsächlichen Images, Enshrouded unter Wine, die
Aktualisierung per Image-Pull, RCON gegen einen echten Minecraft-Server und die
Bind-Mount-Auflösung im Compose-Betrieb.

Dazu seit dem Vorlagenumbau: ob ein KI-erzeugter Entwurf gegen ein reales Image
tatsächlich startet, und ob die Env-Namen eines neu angelegten Spiels stimmen.

Der Entwurf braucht einen API-Schlüssel. Geprüft ist damit nur, was ohne einen
geht: die Statusroute (`available: false`, Entwurf 503), die Verdrahtung mit
gesetztem Schlüssel, und dass die Fehlerübersetzung greift — ein ungültiger
Schlüssel liefert „Der Gemini-Schlüssel wurde abgelehnt" statt eines Stapels.
Dass der Aufruf die API erreicht, ist damit belegt; dass das Schema angenommen
wird und der Entwurf taugt, nicht.

`scripts/entwurf-testen.mjs` beantwortet alle drei Fragen in einem Lauf, sobald
ein Schlüssel vorliegt.

Diese Punkte gehören in jedem Bericht ausdrücklich als ungeprüft benannt.

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

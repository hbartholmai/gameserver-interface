# Handoff: Gameserver-Verwaltungsinterface

## Overview
Ein Web-Panel zur Verwaltung mehrerer Gameserver-Instanzen (Valheim, Minecraft, Enshrouded) auf einem Host. Der Betreiber sieht Auslastung, Version, Spielerzahl, Welt und Adresse jeder Instanz, steuert sie (Start/Stop/Neustart), verwaltet Spieler, Backups, Updates, Mods und die Serverkonfiguration und liest eine Live-Konsole mit Befehlseingabe.

Layout: **Sidebar (Instanzliste) + Detailbereich mit sechs Reitern**.

## About the Design Files
Die HTML-Dateien in diesem Bundle sind **Design-Referenzen** — Prototypen, die Aussehen und Verhalten zeigen, kein Produktionscode zum direkten Übernehmen. Die Aufgabe ist, diese Designs in der bestehenden Umgebung des Zielprojekts nachzubauen (React, Vue, Svelte, SwiftUI …) mit deren etablierten Mustern und Bibliotheken. Existiert noch keine Umgebung, wählt der Entwickler das passende Framework.

Die Dateien sind „Design Components": HTML mit einem Template-Teil und einer JS-Logikklasse, gerendert von `support.js`. Diese Laufzeit ist ein Prototyping-Hilfsmittel und wird **nicht** übernommen — nur Markup-Struktur, Styles und Logik sind relevant. `support.js` liegt nur bei, damit sich die Dateien lokal im Browser öffnen lassen.

Alle Daten im Prototyp sind Beispieldaten mit simulierter Live-Aktualisierung (Timer alle 2 s). In der echten Implementierung ersetzt ein Polling- oder WebSocket-Feed diese Simulation.

## Fidelity
**High-fidelity.** Farben, Typografie, Abstände und Interaktionen sind final gedacht. Zwei Varianten liegen bei:

- `Gameserver Verwaltung v2.dc.html` — **die aktuelle, maßgebliche Variante.** Dunkles, technisches Gaming-Panel.
- `Gameserver Verwaltung v1 (hell).dc.html` — frühere helle, editoriale Variante. Nur als Referenz, nicht implementieren.

Alle Angaben unten beziehen sich auf **v2**.

## Design Tokens (v2)

### Farben
| Rolle | Hex | Verwendung |
| --- | --- | --- |
| Grund | `#0b0e13` | Seitenhintergrund (mit Raster-Overlay) |
| Fläche 1 | `#0e131a` | Panels, Karten, Kopfzeile, aktiver Reiter |
| Fläche 2 | `#11171f` | Sidebar-Karten, sekundäre Buttons, Chips |
| Fläche tief | `#080b0f` | Konsolenfenster, Eingabefelder |
| Rahmen | `#1c2430` | Standardrahmen aller Panels |
| Rahmen kräftig | `#33414f` | Sekundär-Buttons, gestrichelte Rahmen |
| Rahmen leise | `#161d26` | Listenzeilen, Tabellen-Trennlinien |
| Text primär | `#eef3f8` | Überschriften, Kennzahlen, Spielernamen |
| Text Standard | `#dfe5ec` | Body, Eingabefeldtext |
| Text sekundär | `#c3ccd8` | Logtext, Ereignistext, Sek.-Buttonlabel |
| Text gedämpft | `#9aa7b6` | Zeilen-Metadaten, Buttons inaktiv |
| Text Label | `#7c8899` | Versal-Labels (9–10px) |
| Text leise | `#8b98a8` | Log-Zeitstempel, INFO-Level, Offline-Status, „Auto"-Badges (Mindestkontrast 4.5:1) |
| Akzent (Signal) | `#3ee08f` | Online-Status, Primäraktionen, Graphen, Adresse, Fokusring |
| Akzent-Fläche | `rgba(62,224,143,0.12)` | Primärbutton-Grund; Hover `0.24`; Selektion `0.06` |
| Warnung | `#f0b429` | WARN-Logs, Update verfügbar, Kick-Hover, mittlerer Ping, „Manuell"-Backup |
| Gefahr | `#ff6b6b` | Bann-Hover, Ping > 90 ms |
| Balken-Track | `#1a222c` | Hintergrund von Fortschrittsbalken |

Raster-Overlay auf dem Grund (abschaltbar):
`linear-gradient(rgba(62,224,143,0.035) 1px,transparent 1px), linear-gradient(90deg,rgba(62,224,143,0.035) 1px,transparent 1px)`, `background-size: 32px 32px`.

Ping-Farbskala: ≤ 55 ms `#3ee08f`, 56–90 ms `#f0b429`, > 90 ms `#ff6b6b`, unbekannt `#8b98a8`.

### Typografie
- **Chakra Petch** (Google Fonts, 400/500/600/700) — Kennzahlen, Überschriften, Buttons, Reiter. Immer `text-transform: uppercase`, `letter-spacing: 0.02–0.16em`.
- **JetBrains Mono** (Google Fonts, 400/500/700) — Body, Listen, Konsole, Eingaben, Labels. Basis 13px / `line-height: 1.5`.

| Rolle | Font | Größe | Weight | Letter-spacing |
| --- | --- | --- | --- | --- |
| Seitentitel „SERVER CONTROL" | Chakra Petch | 20px | 600 | 0.16em, uppercase |
| Instanzname (Detailkopf) | Chakra Petch | 30px | 700 | 0.03em, uppercase |
| Große Kennzahl (CPU, RAM, Spieler, Disk) | Chakra Petch | 32px | 700 | 0.02em |
| Mittlere Kennzahl (Uptime, Backup, Version) | Chakra Petch | 26px / 22px | 700 | 0.02–0.03em |
| Kopfzeilen-Kennzahl | Chakra Petch | 17px | 600 | 0.04em |
| Instanzname (Sidebar) | Chakra Petch | 16px | 600 | 0.03em, uppercase |
| Button / Reiter | Chakra Petch | 11px | 600 | 0.16em, uppercase |
| Sektionslabel `// Text` | JetBrains Mono | 9px | 400 | 0.2em, uppercase |
| Feldlabel / Badge | JetBrains Mono | 10px | 400 | 0.12–0.18em, uppercase |
| Listenzeile, Konsole | JetBrains Mono | 12px | 400 | — |
| Body | JetBrains Mono | 13px | 400 | — |

### Abstände
Verwendete Werte: 4, 6, 8, 10, 12, 14, 16, 20, 24, 32, 40 px. Seitenpolster 20px vertikal / 24px horizontal, Kopfzeile 16px/24px, Panel-Innenabstand 12–16px, Spalten-Gap 20px, Karten-Gap 12px, Sidebar-Gap 10px.

### Radien, Rahmen, Schatten
- **Border-radius: 0** überall. Kantige Kanten sind Teil des Looks.
- Rahmen durchgehend 1px. Statusstreifen an Sidebar-Karten: 3px links, volle Höhe, in Statusfarbe.
- **Keine Schatten.** Tiefe entsteht durch Flächenhelligkeit.
- Fokus: `outline: 2px solid #3ee08f; outline-offset: 2px` auf allen Buttons, Links, Inputs.
- Scrollbar: 10px, Thumb `#232c38` mit 2px Grundfarben-Rand.

### Animation
Einzige Animation: Status-Punkt im Detailkopf, `@keyframes pulse` — Opazität 1 → 0.35 → 1, 2s, `ease-in-out`, unendlich.

## Screens / Views

### 1. Kopfzeile (global)
**Zweck:** Identität und Host-Gesamtlage.
**Layout:** Flex, `space-between`, umbruchfähig, 16px/24px Polster, Grund `#0e131a`, 1px Unterkante `#1c2430`.
- Links: 30×30px Quadrat mit 1px Akzentrahmen und „GS" in Chakra Petch 700/15px, Akzentfarbe; daneben Titel „SERVER CONTROL"; daneben Kontext „node 01 · epiconline" (9px, `#7c8899`).
- Rechts: drei Kennzahlkacheln (min-width 104px, Rahmen `#1c2430`, Grund `#11171f`, Polster 6px/12px): **Instanzen** `2 / 3` (Akzentfarbe), **Spieler** Summe aller verbundenen Spieler, **Host CPU** Mittelwert der Instanz-CPUs.

### 2. Sidebar — Instanzliste
**Zweck:** Instanz wählen, Zustand auf einen Blick.
**Layout:** `flex: 1 1 280px`, Spalte, Gap 10px. Kopf: `// INSTANZEN` links, Anzahl rechts.
**Instanzkarte** (Rahmen `#1c2430`, Grund `#11171f`, Polster 12px, Gap 9px, `cursor: pointer`):
- 3px breiter Statusstreifen links über die volle Höhe in Statusfarbe; Karteninhalt 8px linksseitig eingerückt.
- Zeile 1: Spielname (9px Label) über Instanzname (Chakra Petch 16px, ellipsis); rechts Status-Chip (9px, uppercase, 1px Rahmen in Statusfarbe, gleiche Textfarbe, Polster 1px/6px).
- Zeile 2: `3 / 10 Spieler` links, `CPU 41 % · RAM 5,4 GB` rechts (11px, `#9aa7b6`).
- Zeile 3: 4px CPU-Balken, Track `#1a222c`, Füllung in Statusfarbe, Breite = CPU-Prozent.
- Hover: Rahmen → `#33414f`. Ausgewählt: 1px Akzentrahmen als Overlay (`inset: -1px`) plus Grund `rgba(62,224,143,0.06)`.
- Abschluss: Button „+ INSTANZ ANLEGEN", 1px gestrichelt `#33414f`, Volllbreite, Hover → Akzentfarbe.

### 3. Detailkopf
**Layout:** Panel (Rahmen `#1c2430`, Grund `#0e131a`, Polster 16px), Flex `space-between`, Ausrichtung `flex-end`, umbruchfähig.
- Links: Metazeile `VALHEIM · 0.220.3 (ASHLANDS) · EPICONLINE` (9px Label) → Instanzname (Chakra Petch 30px) → Statuszeile: Status-Chip mit pulsierendem 6×6px Quadrat, Adresse in Akzentfarbe, Button „COPY" (10px, Fläche `#11171f`), Trenner `|`, `PING 38 ms`.
- Rechts: drei Buttons — **Start/Stop** (primär: Grund `rgba(62,224,143,0.12)`, 1px Akzentrahmen, Akzenttext, Polster 8px/16px), **Neustart** und **Backup** (sekundär: Grund `#11171f`, Rahmen `#33414f`, Text `#c3ccd8`, Hover → Akzentrahmen und -text).

### 4. Reiterleiste
Sechs Reiter: Übersicht · Konsole · Spieler · Backups · Mods · Config. Chakra Petch 11px/600, uppercase, 0.16em, Polster 9px/14px, Gap 4px, gemeinsame 1px Unterkante `#1c2430`. Aktiver Reiter: Overlay mit Grund `#0e131a`, 1px Rahmen `#1c2430` und 2px Akzentkante **oben**. Inaktiv-Hover: Text `#eef3f8`, Grund `#11171f`.

### 5. Reiter „Übersicht"
**Kachelraster:** `grid-template-columns: repeat(auto-fit, minmax(200px, 1fr))`, Gap 12px. Jede Kachel Rahmen `#1c2430`, Grund `#0e131a`, Polster 12px.
1. **CPU** — Label + Kernzahl („4 vCPU") rechts, Wert 32px, darunter Sparkline (SVG `viewBox="0 0 100 30"`, `preserveAspectRatio="none"`, Höhe 40px): gefüllte Fläche `rgba(62,224,143,0.10)` plus 1.2px Akzentlinie mit `vector-effect="non-scaling-stroke"`. 40 Messpunkte.
2. **RAM** — identisch, Referenz ist die Gesamt-RAM-Größe.
3. **Spieler** — Label + „Peak 7", Wert `3 / 10`, Sparkline (`viewBox="0 0 100 24"`, 32px, nur Linie), Fußzeile „Ø 3,4 über 24 h".
4. **Speicher** — Wert in GB, 6px Balken, Fußzeile „von 120 GB · Welt 1,42 GB".
5. **Uptime / Netz** — Wert „71 h 30 m", darunter „RX 82 kB/s · TX 210 kB/s" und „TICK 58,9 Hz".
6. **Letztes Backup** — „heute 04:00", darunter „1,4 GB · 4 Snapshots" und Update-Hinweis in Warnfarbe.

**Zwei Spalten darunter** (`flex: 1 1 320px` je, Gap 20px):
- `// WELT & KONFIGURATION` — Schlüssel-Wert-Liste, Schlüssel `#7c8899` links, Wert `#dfe5ec` rechts, 7px Polster, 1px Unterkante `#161d26`. Felder: Welt (mit Seed), Weltgröße, Modus, Passwort/Whitelist, Anbieter, Autom. Neustart, Speicherort.
- `// EREIGNISSE` — Zeitstempel (58px Spalte, `#8b98a8`) und Text `#c3ccd8`, neueste zuerst, max. 9 Einträge.

### 6. Reiter „Konsole"
- Kopf: `// LIVE-KONSOLE · MIDGARD` links, rechts drei Filter-Chips (Alle / Info / Warn); aktiver Chip mit Akzentrahmen-Overlay und `rgba(62,224,143,0.12)`.
- Logfenster: Rahmen `#1c2430`, Grund `#080b0f`, Polster 12px, feste Höhe 340px, `overflow: auto`, 12px, `line-height: 1.75`. Jede Zeile: Zeitstempel `#8b98a8` · Level in 40px-Spalte (INFO `#8b98a8`, WARN `#f0b429`, CMD `#3ee08f`) · Text `#c3ccd8`, `white-space: pre-wrap`.
- Eingabezeile: grünes `>`-Zeichen, Textfeld (Grund `#080b0f`, Rahmen `#1c2430`, Polster 9px/12px, Platzhalter „Befehl eingeben, z. B. save-all"), Primärbutton „SENDEN". Absenden hängt `> <befehl>` als CMD-Zeile an und protokolliert ein Ereignis.

### 7. Reiter „Spieler"
Zwei Abschnitte, Gap 20px.
- `// VERBUNDENE SPIELER` mit Zähler. Zeile: Rahmen `#161d26`, Grund `#0e131a`, Polster 8px/10px, 4px Abstand, Flex mit Gap 10px — Name (`#eef3f8`, wächst, ellipsis), Spielzeit (`#9aa7b6`), Ping (60px, rechtsbündig, Farbe nach Skala), Button „KICK" (Hover Warnfarbe), Button „BANN" (Hover Gefahrfarbe). Leerzustand: `// niemand verbunden`.
- `// BANNLISTE` mit Zähler. Zeile: Name, Grund der Sperre, Button „AUFHEBEN" (Hover Akzent). Leerzustand: `// keine Sperren`.

### 8. Reiter „Backups"
- Versionspanel: Version (Chakra Petch 22px), Update-Hinweis in Warnfarbe; rechts „UPDATE INSTALLIEREN" (primär) und „BACKUP ERSTELLEN" (sekundär).
- `// SNAPSHOTS` mit Zeitplan rechts („täglich 04:00 · 7 Tage"). Zeile: Dateiname (wächst, ellipsis, `#c3ccd8`), Zeitpunkt (118px), Größe (70px rechtsbündig), Art (70px rechtsbündig — „Manuell" in Warnfarbe, „Auto" in `#8b98a8`), Button „RESTORE".

### 9. Reiter „Mods"
`// MODS & PLUGINS` mit Zähler. Zeile: Name (`flex: 1 1 180px`), Version (84px), Badge (120px — „Update verfügbar" Warnfarbe, „aktiv" Akzent, „deaktiviert" `#8b98a8`), Toggle-Button „EIN"/„AUS" (feste Breite 72px). Leerzustand: `// keine Mods installiert`. Abschluss: gestrichelter Button „+ MOD HINZUFÜGEN".

### 10. Reiter „Config"
`// SERVERKONFIGURATION`, max. 660px breit. Pro Feld eine Zeile: Label (`flex: 1 1 180px`, 11px, uppercase, `#9aa7b6`) und Eingabefeld (`flex: 1 1 260px`, Grund `#080b0f`, Rahmen `#1c2430`, Polster 8px/11px). Felder je Spiel unterschiedlich (Servername, Passwort/MOTD, Slots, Welt/Seed bzw. Schwierigkeit, Crossplay/Whitelist, Autom. Neustart, Speicherintervall/Sichtweite). Abschluss über 1px Oberkante: Primärbutton „SPEICHERN & NEU STARTEN" plus Bestätigungstext in Akzentfarbe („✓ gespeichert · Neustart um 14:02").

## Interactions & Behavior

| Aktion | Wirkung |
| --- | --- |
| Instanzkarte klicken | Auswahl wechselt; Reiter bleibt, Kopiermeldung und Speichernotiz werden zurückgesetzt |
| Reiter klicken | Detailinhalt wechselt |
| Start | Status → „Startet", CPU 22 %, RAM 20 % der Kapazität, Uptime 0, Ping 48 ms; nach 2200 ms → „Online" |
| Stop | Status → „Offline", alle Metriken 0, Spielerliste leer, Verläufe auf Nulllinie, Tickrate und Ping „—" |
| Neustart | Wie Start; Uptime 0, CPU 18 %, nach 2200 ms → „Online" |
| Backup | Neuer Snapshot ganz oben (`<id>-<HHMM>-manuell.tar.zst`, Art „Manuell"), „Letztes Backup" → „jetzt" |
| Update installieren | Buttonlabel → „UPDATE LÄUFT…", nach 1800 ms zurück, Hinweis → „Version ist aktuell" |
| Kick | Spieler aus Liste entfernt, Zähler sinkt, Ereignis „<Name> wurde entfernt" |
| Bann | Spieler entfernt und in Bannliste mit Grund „manuell gesperrt · dauerhaft" |
| Aufheben | Eintrag aus Bannliste entfernt |
| Restore | Status → „Startet", Ereignis „Wiederherstellung aus <Datei> gestartet" |
| Mod-Toggle | Aktiv-Flag kippt, Badge und Buttonlabel folgen |
| Config speichern | Bestätigungstext mit aktueller Uhrzeit, Ereignis protokolliert |
| Copy | Buttonlabel „copy" → „kopiert" für 1600 ms (im Prototyp ohne echten Clipboard-Zugriff — in der Implementierung `navigator.clipboard.writeText(address)`) |
| Konsolenbefehl absenden | Leere Eingabe wird ignoriert; sonst CMD-Zeile plus Ereignis, Feld wird geleert |
| Log-Filter | Zeigt alle Zeilen bzw. nur INFO bzw. nur WARN |

**Jede Zustandsänderung erzeugt einen Eintrag** in der Ereignisliste (max. 9, neueste zuerst) **und** eine INFO-Zeile im Log.

**Live-Simulation** (Intervall 2000 ms, nur laufende Instanzen):
- CPU: Random-Walk ±4.5, begrenzt auf 4–97 %.
- RAM: Random-Walk ±0.175 GB, begrenzt auf 0.4 GB bis 96 % der Kapazität.
- 6 % Chance pro Tick auf Join oder Leave (Namen aus einem Pool), erzeugt eine Logzeile.
- 35 % Chance pro Tick auf eine spielspezifische Logzeile (Platzhalter `{n}` = Zufallszahl 60–540, `{p}` = zufälliger verbundener Spieler).
- Uptime +0.0006 h pro Tick; Verlaufsarrays (40 Werte) rollen weiter; Log gekappt auf 140 Zeilen.

**Responsiv:** Alles fließt. Sidebar `flex: 1 1 280px`, Detailbereich `flex: 3 1 560px` — unter etwa 900px stapeln sie. Kachelraster ist `auto-fit`/`minmax(200px,1fr)`. Alle Buttonleisten und Zeilen sind `flex-wrap: wrap`. Keine festen Höhen außer dem Logfenster (340px).

## State Management

Globaler Zustand:
- `sel` — Index der gewählten Instanz
- `tab` — `overview | console | players | backups | mods | settings`
- `logLevel` — `Alle | Info | Warn`
- `cmd` — Inhalt der Befehlseingabe
- `copied`, `saveNote` — kurzlebige UI-Rückmeldungen

Pro Instanz:
`id, game, provider, name, version, address, status, running, updating, cpu, cores, ram, ramTotal, diskUsed, diskTotal, worldSize, tps, ping, max, peak, avg, netIn, netOut, uptimeH, lastBackup, lastBackupSize, backupSchedule, updateNote, facts[], playerList[[name, spielzeit, ping]], banned[[name, grund]], mods[[name, version, aktiv, updateVerfügbar]], backups[[datei, zeitpunkt, größe, art]], settings[[label, wert]], events[[zeit, text]], log[[zeit, level, text]], cpuHist[40], ramHist[40], playerHist[40]`

**Wichtig:** Die Spielerzahl wird immer aus `playerList.length` abgeleitet, nie separat gehalten.

**Datenanbindung in der echten Implementierung:**
- Metriken (CPU, RAM, Disk, Netz, Uptime, Tickrate, Ping) per Polling (1–5 s) oder WebSocket; Verlaufsarrays clientseitig als Ringpuffer (40 Werte) halten oder vom Backend als Zeitreihe beziehen.
- Konsole per WebSocket-Stream; Befehle über RCON (Minecraft), Server-eigene Admin-API bzw. stdin des Prozesses.
- Steuerbefehle asynchron mit Übergangsstatus („Startet") und Timeout-Behandlung — im Prototyp durch feste 2200 ms simuliert.
- Fehlerzustände fehlen im Prototyp und müssen ergänzt werden: nicht erreichbarer Host, fehlgeschlagener Start, Backup-Fehler, abgebrochene Konsolenverbindung. Vorschlag: Statusfarbe `#ff6b6b`, Fehlerzeile im Log als Level `ERROR`.

## Assets
Keine Bilder oder Icon-Dateien. Der Markenwürfel „GS" ist reiner Text in einem Rahmen. Alle Statusanzeigen sind CSS-Rechtecke.

Schriften über Google Fonts:
`https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap`

Sollen später Icons ergänzt werden, passt eine strichbasierte Familie (z. B. Lucide) zum Stil.

## Files
- `Gameserver Verwaltung v2.dc.html` — maßgebliche dunkle Variante (Template + Logik in einer Datei)
- `Gameserver Verwaltung v1 (hell).dc.html` — frühere helle Variante, nur Referenz
- `support.js` — Prototyping-Laufzeit, damit die Dateien im Browser öffnen; **nicht übernehmen**

Zum Ansehen: Datei im Browser öffnen (alle drei müssen im selben Ordner liegen).

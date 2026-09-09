# Architektur und Entscheidungen

Dieses Dokument hält fest, **warum** das Panel so gebaut ist. Das *Was* steht im
Code, das *Wie man es bedient* im README.

## Ausgangslage

Das Repo enthielt zu Beginn nur den Design-Handoff in
`design_handoff_gameserver_panel/`: zwei Prototyp-Dateien und eine sehr
detaillierte `README.md` mit Design-Tokens, Screens, Interaktionen und
Datenmodell. Der Prototyp ist reine Simulation — alle Werte sind Beispieldaten
mit einem 2-Sekunden-Timer.

Aufgabe war ein echtes Panel für Linux-Hosts, das dieses Design umsetzt,
Gameserver wirklich steuert und neue Instanzen aus fertigen Vorlagen für
Minecraft, Valheim und Enshrouded anlegen kann.

## Mit dem Auftraggeber abgestimmte Weichenstellungen

| Frage | Entscheidung | Verworfene Alternativen |
| --- | --- | --- |
| Wie laufen die Server? | **Docker-Container** aus bewährten Community-Images | systemd + SteamCMD nativ; Abstraktion mit Docker zuerst |
| Backend-Stack | **TypeScript-Monorepo** (Fastify + React, geteilte Zod-Schemas) | Python/FastAPI; Go |
| Umfang | **Vollständige Vertikale** — echtes Backend, nicht nur Mock-UI | UI zuerst; Backend zuerst |
| Zugang | **Ein Admin-Login** (Passwort-Hash, Session-Cookie, CSRF) | Mehrbenutzer mit Rollen; Absicherung nur per Reverse-Proxy |

Docker gewann, weil Enshrouded ohnehin Wine braucht — das kapselt ein fertiges
Image — und weil Isolation, Ressourcenlimits und Updates per Image-Pull ohne
eigenes Setup-Scripting je Spiel funktionieren.

## Tragende Entscheidungen

### Vorlagen sind Daten, nicht Code-Zweige

Eine Vorlage ist ein deklaratives Objekt. Aus derselben Quelle entstehen
Anlege-Wizard, Config-Reiter und der Container.

Die Alternative — pro Spiel eine eigene Klasse mit eigenem Formular und eigener
Container-Logik — hätte drei Stellen erzeugt, die bei jeder Änderung
auseinanderlaufen. So kostet ein viertes Spiel im Normalfall eine Datei.

Der Preis: Alles, was ein Spiel braucht, muss sich im Vorlagen-Schema
ausdrücken lassen. Wo das nicht reicht — etwa RCON-Verbindungen oder
A2S-Abfragen — gibt es zusätzlich einen **Adapter** pro Spiel in
`packages/server/src/games/`. Vorlage beschreibt, Adapter handelt.

### Fähigkeiten statt Spiel-Abfragen

Der Prototyp nimmt an, dass jede Instanz eine Befehlseingabe und Mods hat.
Recherche ergab, dass das nur für Minecraft stimmt:

- **Valheim** hat weder RCON noch stdin-Befehle. Admin-Befehle gibt es nur in
  der Spielkonsole (F5). Beim Verlassen protokolliert Valheim keinen
  Spielernamen — die Liste wird gegen die Steam-Abfrage abgeglichen.
- **Enshrouded** hat kein natives Linux-Binary und läuft unter Wine. Es bietet
  weder RCON noch Mod-Unterstützung. Der Zugang läuft über **Server-Rollen**
  (Admin, Freund, Gast) mit je eigenem Passwort; ein einzelnes Serverpasswort
  ist im Spiel abgekündigt. Es gibt nur noch einen Port.
- Einen **Ping je Spieler** liefert keines der drei Spiele über sein
  Serverprotokoll. Die **Spielzeit** ebenso wenig — die führt das Panel selbst
  über die Tabelle `player_sessions`.

Statt das im Frontend über `game === 'valheim'` abzufangen, trägt jede Vorlage
ein `capabilities`-Objekt. Die UI degradiert daran entlang: Die Eingabezeile
wird deaktiviert **mit Hinweis** statt versteckt, Kick und Bann entfallen, der
Mod-Reiter wird ausgeblendet.

Deaktivieren statt Verstecken ist Absicht: Ein fehlendes Bedienelement wirkt wie
ein Fehler, ein deaktiviertes mit Begründung erklärt die Eigenart des Spiels.

### Runtime-Abstraktion mit zwei Implementierungen

`Runtime` (`packages/server/src/runtime/types.ts`) kapselt
`create/start/stop/logs/stats/exec/pull`. Es gibt `DockerRuntime` über dockerode
und `FakeRuntime` im Speicher.

Die Fake-Variante ist bewusst kein Wegwerf-Mock: Sie ist Test-Double, sie ist
Entwicklungsmodus ohne Docker-Daemon, und sie erzeugt Logzeilen im **echten
Format** der jeweiligen Spiele. Dadurch laufen im Test dieselben Parser wie in
Produktion — ein Mock mit Wunschformat hätte genau die Fehlerklasse verdeckt,
die hier am wahrscheinlichsten ist.

Ein systemd-Adapter ließe sich daneben stellen, ohne die Dienste anzufassen.

### Volumes als Bind-Mounts

Instanzdaten liegen unter `GSP_DATA_DIR/instances/<id>/<volume>` und werden in
den Container gemountet. Named Volumes wären idiomatischer, aber dann müssten
Backups und Mod-Verwaltung Dateien durch den Container streamen. So arbeiten
beide direkt auf dem Dateisystem — deutlich einfacher und schneller.

Der Preis ist der Pfad-Fallstrick beim Betrieb im Container (siehe unten) und
die Notwendigkeit, Pfade zu prüfen: `toHostPath()` löst Container-Pfade nur
innerhalb der deklarierten Volumes auf und gibt sonst `null` zurück.

### Statusableitung statt fester Wartezeiten

Der Prototyp simuliert den Start mit festen 2200 ms. Real wird der Status aus
dem Containerzustand plus der **Startmeldung im Log** abgeleitet:

```
Container fehlt            → Fehler (start() erzeugt ihn neu)
läuft, Startmeldung fehlt  → Startet
läuft, Startmeldung da     → Online
gestoppt, Exit-Code ≠ 0    → Fehler
```

Deshalb trägt jede Vorlage ein `ready`-Muster. Die im Handoff als fehlend
markierten Fehlerzustände sind damit abgedeckt.

### Messwerte

`Ticker` erhebt im Takt von `GSP_REFRESH_MS`. Zwei Sparmaßnahmen:

- Hört niemand auf das Thema `metrics`, wird nur jeder zehnte Takt gemessen.
  Ein unbeobachtetes Panel soll den Host nicht belasten.
- Die Serverabfrage über das Spielprotokoll (Ping, Spielerliste) ist teurer als
  `docker stats` und läuft in größerem Abstand (`probeIntervalMs`).

Die CPU-Zahl aus Docker bezieht sich auf den ganzen Host. Im Panel wird sie
durch das CPU-Kontingent der Instanz geteilt: 100 % heißt „das Kontingent
dieser Instanz ist ausgeschöpft", nicht „der Host steht still". Das passt zur
Balkendarstellung des Designs und zur Beschriftung „4 vCPU".

Verläufe sind Ringpuffer mit 40 Werten — genau die Punktzahl, die die
Sparklines im Design zeichnen.

## Abweichungen vom ursprünglichen Plan

Alle drei sind im Code an der jeweiligen Stelle begründet.

| Geplant | Umgesetzt | Grund |
| --- | --- | --- |
| Argon2id | **scrypt** aus `node:crypto` | Keine native Zusatzabhängigkeit; das Panel soll sich ohne Build-Toolchain installieren lassen. scrypt ist speicherhart und für den Zweck angemessen. |
| Drizzle ORM | **Handgeschriebenes SQL** + Migrationsliste | Neun Tabellen mit stabilem Schema; ein ORM samt Generierungsschritt hätte mehr Bewegung als Nutzen gebracht. |
| Schriften über Google Fonts | **Selbst gehostet** (`@fontsource/*`) | Ein selbstgehostetes Panel läuft oft im LAN ohne Internet. |

## Sicherheitsmodell

**Der eingebundene Docker-Socket entspricht Root-Rechten auf dem Host.** Das ist
die dominierende Eigenschaft: Wer das Panel bedienen kann, kann darüber
beliebige Container starten. Daraus folgt die Empfehlung im README, das Panel
nicht ohne TLS und Reverse-Proxy zu exponieren; die Compose-Datei veröffentlicht
den Port bewusst nur auf `127.0.0.1`.

Umgesetzt:

- Passwörter mit scrypt; bei unbekanntem Benutzer wird trotzdem ein
  Hash-Vergleich durchgeführt, damit die Antwortzeit nichts verrät.
- Session-Cookie `httpOnly`/`SameSite=Lax`; jede schreibende Anfrage braucht
  zusätzlich den CSRF-Token der Sitzung. Vergleich in konstanter Zeit.
- Rate-Limit auf die Anmeldung.
- Container ausschließlich über die dockerode-API — Nutzereingaben landen nie in
  einer Shell.
- RCON-Passwörter werden erzeugt, bleiben containerintern (Port nicht auf dem
  Host veröffentlicht) und verlassen die API nie.
- Pfad-Traversal-Schutz bei Backup-Wiederherstellung und Mod-Upload.
- Konsolenbefehle werden mit Benutzer protokolliert.

## Bekannte Grenzen

- Ein Benutzer mit vollen Rechten; keine Rollen.
- Ein Host je Panel. Die Kopfzeile ist auf mehrere Knoten vorbereitet
  (`GSP_NODE_LABEL`), die Datenhaltung nicht.
- Mod-Aktualisierungen werden nicht geprüft — es ist keine Quelle wie Modrinth
  oder Thunderstore angebunden. `updateAvailable` ist deshalb immer `false`,
  statt etwas zu behaupten.
- Verpasste Backup-Zeitpunkte werden nach einem Neustart des Panels nicht
  nachgeholt.
- Der Enshrouded-Spielmodus lässt sich nur als Preset wählen; Feinjustierung
  einzelner Werte erfordert Hand an der `enshrouded_server.json`.

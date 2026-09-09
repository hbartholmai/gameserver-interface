# Ein weiteres Spiel ergänzen

Seit Vorlagen Daten statt Code sind, braucht ein weiteres Spiel im Normalfall
**keine Codeänderung**. Es entsteht im Panel unter „Vorlagen" — von Hand oder als
KI-Entwurf, den man prüft, bevor er gespeichert wird.

## 1. Vorher klären

Diese vier Fragen entscheiden über die **Fähigkeiten** — und sie sind die
Hauptquelle für falsche Annahmen. Die Antworten gehören belegt, nicht geraten.

| Frage | Wirkt auf |
| --- | --- |
| Nimmt der Server Befehle entgegen (RCON, stdin)? | Konsole: `rcon` / `nur lesend` |
| Woher kommt die Spielerliste — RCON, Steam-Query, nur Log? | Spielerliste |
| Gibt es serverseitiges Kick/Bann? | Kick & Bann |
| Unterstützt das Spiel Mods, und wo liegen sie? | Mods, Mod-Verzeichnis, Endungen |

Dazu: Welche Ports, welche Volumes, welche Umgebungsvariablen dokumentiert das
gewählte Image, und woran erkennt man im Log, dass der Server hochgefahren ist?

Die Fähigkeiten sind keine Beschriftung: Sie bestimmen, welche Bedienelemente die
Oberfläche zeigt **und welcher Adapter den Server abfragt**. Ein Spiel mit RCON,
Steam-Query oder nur Log braucht deshalb keinen eigenen Adapter.

Konsole und Spielerliste sind dabei **getrennte Fragen**. Palworld etwa spricht
RCON, zählt Spieler aber schneller über die Steam-Abfrage: `console: rcon` neben
`players: a2s`. Wo RCON im Spiel ist, gehören drei Angaben dazu:

- ein **Port namens `rcon`** in den Ports, sonst weiß das Panel nicht, wohin es
  sich verbindet (ein anderer Name geht, dann trägt ihn `adapter.rconPortName`);
  verbunden wird der Container-Port, RCON gehört nicht auf den Host
  veröffentlicht.
- **Befehl und Format der Spielerliste**, falls die Liste per RCON kommt und der
  Server nicht Minecrafts `list` mit dessen Satzform beantwortet: Palworld
  antwortet auf `ShowPlayers` mit CSV.
- **Kick und Bann brauchen eine Konsole.** Ohne `console: rcon` lehnt der Server
  die Vorlage ab — die Knöpfe wären da und lieferten nichts. Umgekehrt heißt
  RCON nicht automatisch Kick: Palworld adressiert Spieler dort über SteamIDs,
  die das Panel nicht führt, also bleibt `moderation` aus.

## 2. Vorlage anlegen

**Panel → Vorlagen → „+ Vorlage von Hand"**, oder — wenn ein API-Schlüssel
hinterlegt ist — **„+ Vorlage entwerfen lassen"**. Der Entwurf sucht die
Dokumentation des Images und schlägt eine Vorlage vor; gespeichert wird sie
nicht, sondern landet im Editor, mit den Belegen daneben.

**Prüfe den Entwurf, bevor du speicherst.** Genau dafür stehen die Belege da:
Erfundene Variablennamen und Ports fallen sonst erst auf der Zielmaschine auf,
wo niemand mehr nachsehen kann, was gemeint war.

Worauf zu achten ist:

- **Kennung** — steckt später in Container-Labels und Instanzdatensätzen und
  lässt sich nicht mehr ändern. Kleinbuchstaben, Ziffern, Bindestriche.
- **Felder** — „Später änderbar" aus für alles, was nach dem Anlegen feststeht
  (Weltname, Seed). „Geheim" für Passwörter; die werden in der API maskiert.
  Der Hilfetext erklärt Grenzen des Spiels, keine Selbstverständlichkeiten.
- **Ports** — „Nur intern" für Ports, die nicht auf dem Host landen sollen
  (RCON). Der Vorschlag ist nur ein Vorschlag; der Wizard sucht bei Kollision
  den nächsten freien Port.
- **Umgebungsvariablen** — hier entsteht die Container-Umgebung. Was fehlt,
  sieht der Server nicht. Zwei Einstellungen lohnen besondere Beachtung:
  - *Leer weglassen* — die Variable wird gar nicht gesetzt statt leer. Richtig
    für optionale Passwörter und Seeds; ein leeres `SERVER_PASS` lässt manche
    Images mit einer Passwortprüfung abbrechen.
  - *Ja/Nein übersetzen* — nötig bei Ja/Nein-Feldern, weil die Images sehr
    unterschiedliche Werte erwarten: `TRUE`, `true`, `-crossplay`.
- **Startargumente** — der Ausweg für Images, die sich nicht allein über
  Umgebungsvariablen einrichten lassen. Sie ersetzen das Kommando des Images;
  bleibt die Liste leer, bleibt das Kommando unangetastet. Jeder Eintrag wird zu
  Flag und Wert, `-port` und `7777` also getrennt. *Leer weglassen* lässt bei
  leerem Wert **auch das Flag** entfallen — nötig, damit ein optionales Passwort
  nicht als `-password ""` beim Server ankommt.

  Der Regelfall bleibt die Umgebung. Greif erst hierher, wenn die Dokumentation
  des Images belegt, dass es eine Einstellung nur als Argument kennt: Terraria
  ist so ein Fall — das Image liest genau zwei Umgebungsvariablen, alles Weitere
  erwartet der Server auf der Kommandozeile.
- **Log-Muster** — bei Beitritt und Abgang muss **Gruppe 1** der Spielername
  sein. Gibt es kein Abgangsmuster, leer lassen und bei der Spielerliste etwas
  wählen, das eine Zählung liefert (Steam-Query), sonst bleiben Spieler in der
  Liste stehen.
- **Backup-Pfade** — nur Pfade innerhalb der deklarierten Volumes; der Server
  lehnt anderes ab. Vorbefehle nur mit RCON.

## 3. Die Musterprobe benutzen

Im Abschnitt „Log-Muster" gibt es ein Feld **Probe**. Füge dort eine echte
Logzeile des Servers ein — der Editor zeigt sofort, ob Beitritt, Abgang und
Startmeldung greifen, welcher Name in Gruppe 1 landet und wie die bereinigte
Zeile aussieht.

Das ist der wichtigste Handgriff dieses Ablaufs. Ein falsches Muster fällt sonst
erst im Betrieb auf: keine Spieler in der Liste, oder eine Instanz, die für
immer auf „Startet" steht.

## 4. Beispielzeilen für den Betrieb ohne Docker

Mit `GSP_RUNTIME=fake` erzeugt das Panel Logzeilen aus dem Abschnitt
„Beispielzeilen ohne Docker". Sie müssen zu den Mustern **derselben Vorlage**
passen — der Server prüft das beim Speichern und lehnt sonst ab.

Platzhalter: `{time}`, `{name}`, `{n}`. Trage die Zeilen im echten Format des
Spiels ein; Wunschformat hier bedeutet, dass es ohne Docker läuft und in
Produktion nicht.

## 5. Ausprobieren

```bash
GSP_RUNTIME=fake npm run dev
```

Instanz über den Wizard aus der neuen Vorlage anlegen und prüfen: Erreicht sie
`Online` (greift das Startmuster?), erscheinen im Konsolen-Reiter geparste
Zeilen, tauchen Spieler in der Liste auf, blendet die Oberfläche die richtigen
Bedienelemente aus?

Ein Test gegen den echten Container bleibt Sache einer Maschine mit
Docker-Daemon — das im Bericht so benennen.

## Eine Vorlage bearbeiten

Auch die mitgelieferten Vorlagen sind editierbar. Zwei Dinge gelten dabei:

- **Laufende Instanzen bleiben unberührt.** Sie werden als „Vorlage geändert"
  markiert; erst ein Neuaufbau übernimmt den neuen Stand. Die Container-Umgebung
  ist unveränderlich, deshalb ginge es gar nicht anders.
- **Ein Panel-Update setzt nichts zurück.** Beim Start werden nur *fehlende*
  mitgelieferte Vorlagen ergänzt, vorhandene nie überschrieben.

Eine Vorlage lässt sich nicht löschen, solange Instanzen darauf beruhen.

## Wann doch Code nötig ist

Nur, wenn das Spiel ein Protokoll spricht, das noch keiner der drei Adapter
kennt (`games/minecraft.ts` für RCON, `games/valheim.ts` für Steam-Query,
`games/enshrouded.ts` für reines Log). Dann kommt ein vierter Adapter dazu und
`capabilities.players` in `packages/shared/src/schema/template.ts` bekommt einen
weiteren Wert. Ein neues **Antwortformat** der RCON-Spielerliste ist der
kleinere Fall: dafür genügt ein weiterer Wert für `adapter.rconListFormat` und
eine Parserfunktion daneben.

Wer eine Vorlage als **Startbestand** mitliefern will — also so, dass eine
frische Installation sie bekommt —, legt sie in
`packages/shared/src/templates/` an und trägt sie in `BUILTIN_DEFINITIONS`
ein. Für den laufenden Betrieb ist das nicht nötig.

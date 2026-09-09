import { useMemo, useState } from 'react';
import type {
  EnvMapping,
  FieldSpec,
  PortSpec,
  TemplateDefinition,
  ValidationRule,
  VolumeSpec,
} from '@gsp/shared';
import { Abschnitt, Liste, Schalter, TextFeld, WahlFeld, ZahlFeld } from './vorlagen-teile.js';

/**
 * Der Editor einer Vorlage. Er bildet die Definition Abschnitt für Abschnitt
 * ab; gespeichert wird erst auf Knopfdruck, und die eigentliche Prüfung macht
 * der Server — die Fehler kommen feldbezogen zurück und stehen hier oben.
 */
export function VorlagenEditor({
  definition,
  builtin,
  instanzen,
  neu,
  fehler,
  beschaeftigt,
  onAendern,
  onSpeichern,
  onLoeschen,
  onAbbrechen,
}: {
  definition: TemplateDefinition;
  builtin: boolean;
  instanzen: number;
  neu: boolean;
  fehler: { field: string; message: string }[];
  beschaeftigt: boolean;
  onAendern: (definition: TemplateDefinition) => void;
  onSpeichern: () => void;
  onLoeschen: () => void;
  onAbbrechen: () => void;
}) {
  const setze = <K extends keyof TemplateDefinition>(schluessel: K, wert: TemplateDefinition[K]) =>
    onAendern({ ...definition, [schluessel]: wert });

  return (
    <div className="vorlageneditor">
      {fehler.length > 0 && (
        <div className="banner banner--fehler" role="alert">
          <div>
            {fehler.map((f, i) => (
              <div key={i}>
                {f.field ? `${f.field}: ` : ''}
                {f.message}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="vorlageneditor__kopf">
        <h2 className="vorlageneditor__name">{definition.label || 'Neue Vorlage'}</h2>
        <span className="vorlageneditor__meta">
          {builtin ? 'mitgeliefert' : 'eigene Vorlage'}
          {instanzen > 0 ? ` · ${instanzen} Instanzen` : ''}
        </span>
      </div>

      <Abschnitt titel="Stammdaten" offenAnfangs>
      <TextFeld
        label="Kennung"
        wert={definition.id}
        gesperrt={!neu}
        hilfe={
          neu
            ? 'Kleinbuchstaben, Ziffern, Bindestriche. Sie steckt später in Container-Labels und lässt sich nicht mehr ändern.'
            : 'Unveränderlich — sie steckt in Container-Labels und Instanzdatensätzen.'
        }
        onAendern={(wert) => setze('id', wert)}
      />
      <TextFeld label="Name" wert={definition.label} onAendern={(wert) => setze('label', wert)} />
      <TextFeld
        label="Kurzbeschreibung"
        wert={definition.summary}
        einzeilig={false}
        hilfe="Erscheint auf der Auswahlkarte im Anlege-Wizard."
        onAendern={(wert) => setze('summary', wert)}
      />
      <TextFeld label="Docker-Image" wert={definition.image} onAendern={(wert) => setze('image', wert)} />
      <TextFeld label="Standard-Tag" wert={definition.defaultTag} onAendern={(wert) => setze('defaultTag', wert)} />
      <ZahlFeld
        label="Speicher (MB)"
        wert={definition.defaultMemoryMb}
        onAendern={(wert) => setze('defaultMemoryMb', wert)}
      />
      <ZahlFeld label="vCPU" wert={definition.defaultCpus} onAendern={(wert) => setze('defaultCpus', wert)} />
      <TextFeld
        label="Hinweise"
        wert={definition.notes.join('\n')}
        einzeilig={false}
        hilfe="Eine Zeile je Hinweis. Sie stehen im Wizard und über der Konsole."
        onAendern={(wert) => setze('notes', wert.split('\n').filter((z) => z.trim() !== ''))}
      />
      </Abschnitt>

      <Abschnitt
        titel="Fähigkeiten"
        hinweis="Danach richtet sich, welche Bedienelemente die Oberfläche zeigt und welcher Adapter den Server abfragt — nicht nach dem Spielnamen."
      >
      <WahlFeld
        label="Konsole"
        wert={definition.capabilities.console}
        optionen={[
          { value: 'rcon', label: 'RCON — Befehle möglich' },
          { value: 'readonly', label: 'nur lesend — Log-Stream' },
        ]}
        onAendern={(wert) => setze('capabilities', { ...definition.capabilities, console: wert })}
      />
      <WahlFeld
        label="Spielerliste"
        wert={definition.capabilities.players}
        optionen={[
          { value: 'rcon', label: 'über RCON' },
          { value: 'a2s', label: 'Steam-Abfrage (A2S)' },
          { value: 'log', label: 'nur aus dem Log' },
        ]}
        onAendern={(wert) => setze('capabilities', { ...definition.capabilities, players: wert })}
      />
      <WahlFeld
        label="Mods"
        wert={definition.capabilities.mods}
        optionen={[
          { value: 'none', label: 'keine' },
          { value: 'plugins', label: 'Plugins' },
          { value: 'bepinex', label: 'BepInEx' },
        ]}
        onAendern={(wert) => setze('capabilities', { ...definition.capabilities, mods: wert })}
      />
      <Schalter
        label="Kick & Bann"
        wert={definition.capabilities.moderation}
        hilfe="Nur einschalten, wenn der Server das serverseitig kann."
        onAendern={(wert) => setze('capabilities', { ...definition.capabilities, moderation: wert })}
      />
      {definition.capabilities.mods !== 'none' && (
        <TextFeld
          label="Mod-Verzeichnis"
          wert={definition.modsPath ?? ''}
          hilfe="Container-Pfad, etwa /data/plugins."
          onAendern={(wert) => setze('modsPath', wert)}
        />
      )}
      {definition.capabilities.mods !== 'none' && (
        <TextFeld
          label="Mod-Endungen"
          wert={definition.modExtensions.join(', ')}
          hilfe="Komma-getrennt, etwa .jar oder .dll"
          onAendern={(wert) =>
            setze(
              'modExtensions',
              wert.split(',').map((e) => e.trim()).filter(Boolean),
            )
          }
        />
      )}
      {definition.capabilities.players === 'a2s' && (
        <TextFeld
          label="Abfrageport"
          wert={definition.adapter.queryPortName ?? ''}
          hilfe="Name des Ports aus dem Abschnitt unten, über den die Steam-Abfrage läuft."
          onAendern={(wert) => setze('adapter', { ...definition.adapter, queryPortName: wert })}
        />
      )}
      <TextFeld
        label="Slotzahl-Feld"
        wert={definition.adapter.maxPlayersField ?? ''}
        hilfe="Kennung des Felds mit der maximalen Spielerzahl — für die Anzeige „x / y Spieler“."
        onAendern={(wert) => setze('adapter', { ...definition.adapter, maxPlayersField: wert || undefined })}
      />
      </Abschnitt>

      <Abschnitt titel="Ports" anzahl={definition.ports.length}>
      <Liste
        eintraege={definition.ports}
        leerText="mindestens ein Port wird gebraucht"
        neu={(): PortSpec => ({
          name: 'game',
          label: 'Spielport',
          container: 27015,
          protocol: 'udp',
          defaultHost: 27015,
          internalOnly: false,
        })}
        onAendern={(ports) => setze('ports', ports)}
        zeichne={(port, aendern) => (
          <>
            <TextFeld label="Name" wert={port.name} onAendern={(v) => aendern({ ...port, name: v })} />
            <TextFeld label="Beschriftung" wert={port.label} onAendern={(v) => aendern({ ...port, label: v })} />
            <ZahlFeld label="Port im Container" wert={port.container} onAendern={(v) => aendern({ ...port, container: v })} />
            <ZahlFeld label="Vorschlag Host" wert={port.defaultHost} onAendern={(v) => aendern({ ...port, defaultHost: v })} />
            <WahlFeld
              label="Protokoll"
              wert={port.protocol}
              optionen={[
                { value: 'tcp', label: 'tcp' },
                { value: 'udp', label: 'udp' },
              ]}
              onAendern={(v) => aendern({ ...port, protocol: v })}
            />
            <Schalter
              label="Nur intern"
              wert={port.internalOnly}
              hilfe="Nicht auf dem Host veröffentlichen — richtig für RCON."
              onAendern={(v) => aendern({ ...port, internalOnly: v })}
            />
          </>
        )}
      />

      </Abschnitt>

      <Abschnitt titel="Volumes" anzahl={definition.volumes.length}>
      <Liste
        eintraege={definition.volumes}
        leerText="mindestens ein Volume wird gebraucht"
        neu={(): VolumeSpec => ({ name: 'data', containerPath: '/data', role: 'data' })}
        onAendern={(volumes) => setze('volumes', volumes)}
        zeichne={(volume, aendern) => (
          <>
            <TextFeld label="Name" wert={volume.name} onAendern={(v) => aendern({ ...volume, name: v })} />
            <TextFeld
              label="Pfad im Container"
              wert={volume.containerPath}
              onAendern={(v) => aendern({ ...volume, containerPath: v })}
            />
            <WahlFeld
              label="Rolle"
              wert={volume.role}
              optionen={[
                { value: 'data', label: 'Daten' },
                { value: 'config', label: 'Konfiguration' },
                { value: 'mods', label: 'Mods' },
              ]}
              onAendern={(v) => aendern({ ...volume, role: v })}
            />
          </>
        )}
      />

      </Abschnitt>

      <Abschnitt
        titel="Formularfelder"
        anzahl={definition.fields.length}
        hinweis="Die Reihenfolge bestimmt, wie der Anlege-Wizard und der Config-Reiter aussehen."
      >
      <Liste
        eintraege={definition.fields}
        leerText="noch keine Felder — sie bilden den Anlege-Wizard und den Config-Reiter"
        neu={(): FieldSpec => ({
          id: 'neuesFeld',
          label: 'Neues Feld',
          type: 'text',
          default: '',
          required: false,
          editable: true,
          restartRequired: true,
          secret: false,
        })}
        onAendern={(fields) => setze('fields', fields)}
        zeichne={(feld, aendern) => (
          <>
            <TextFeld label="Kennung" wert={feld.id} onAendern={(v) => aendern({ ...feld, id: v })} />
            <TextFeld label="Beschriftung" wert={feld.label} onAendern={(v) => aendern({ ...feld, label: v })} />
            <WahlFeld
              label="Typ"
              wert={feld.type}
              optionen={[
                { value: 'text', label: 'Text' },
                { value: 'password', label: 'Passwort' },
                { value: 'number', label: 'Zahl' },
                { value: 'select', label: 'Auswahl' },
                { value: 'boolean', label: 'Ja/Nein' },
              ]}
              onAendern={(v) =>
                aendern({ ...feld, type: v, default: v === 'boolean' ? false : v === 'number' ? 0 : '' })
              }
            />
            <TextFeld
              label="Standardwert"
              wert={String(feld.default ?? '')}
              onAendern={(v) =>
                aendern({
                  ...feld,
                  default: feld.type === 'boolean' ? v === 'true' : feld.type === 'number' ? Number(v) : v,
                })
              }
            />
            {feld.type === 'select' && (
              <TextFeld
                label="Optionen"
                wert={(feld.options ?? []).map((o) => `${o.value}=${o.label}`).join('\n')}
                einzeilig={false}
                hilfe="Eine Zeile je Option, Form wert=Beschriftung"
                onAendern={(v) =>
                  aendern({
                    ...feld,
                    options: v
                      .split('\n')
                      .map((z) => z.trim())
                      .filter(Boolean)
                      .map((z) => {
                        const [wert, ...rest] = z.split('=');
                        return { value: (wert ?? '').trim(), label: (rest.join('=') || wert || '').trim() };
                      }),
                  })
                }
              />
            )}
            <TextFeld label="Hilfetext" wert={feld.help ?? ''} onAendern={(v) => aendern({ ...feld, help: v || undefined })} />
            <Schalter label="Pflichtfeld" wert={feld.required} onAendern={(v) => aendern({ ...feld, required: v })} />
            <Schalter
              label="Später änderbar"
              wert={feld.editable}
              hilfe="Aus für alles, was nach dem Anlegen feststeht — Weltname, Seed."
              onAendern={(v) => aendern({ ...feld, editable: v })}
            />
            <Schalter
              label="Geheim"
              wert={feld.secret}
              hilfe="Wird in der API maskiert und nicht unverändert zurückgeschickt."
              onAendern={(v) => aendern({ ...feld, secret: v })}
            />
          </>
        )}
      />

      </Abschnitt>

      <EnvAbschnitt definition={definition} onAendern={(env) => setze('env', env)} />
      <LogAbschnitt definition={definition} onAendern={onAendern} />

      <Abschnitt titel="Backup" anzahl={definition.backup.paths.length}>
      <TextFeld
        label="Pfade"
        wert={definition.backup.paths.join('\n')}
        einzeilig={false}
        hilfe="Eine Zeile je Pfad. Sie müssen innerhalb der Volumes oben liegen."
        onAendern={(v) =>
          setze('backup', { ...definition.backup, paths: v.split('\n').map((z) => z.trim()).filter(Boolean) })
        }
      />
      {definition.capabilities.console === 'rcon' && (
        <>
          <TextFeld
            label="Vorbefehle"
            wert={definition.backup.preCommands.join('\n')}
            einzeilig={false}
            hilfe="Vor dem Sichern abgesetzt, etwa save-off."
            onAendern={(v) =>
              setze('backup', {
                ...definition.backup,
                preCommands: v.split('\n').map((z) => z.trim()).filter(Boolean),
              })
            }
          />
          <TextFeld
            label="Nachbefehle"
            wert={definition.backup.postCommands.join('\n')}
            einzeilig={false}
            hilfe="Laufen auch, wenn das Sichern fehlschlägt."
            onAendern={(v) =>
              setze('backup', {
                ...definition.backup,
                postCommands: v.split('\n').map((z) => z.trim()).filter(Boolean),
              })
            }
          />
        </>
      )}

      </Abschnitt>

      <ValidierungsAbschnitt definition={definition} onAendern={(v) => setze('validations', v)} />

      {/* Derselbe Hinweis noch einmal am Fuß: der Editor ist lang, und wer
          unten auf „Speichern“ drückt, sieht ein Banner ganz oben nicht. */}
      {fehler.length > 0 && (
        <div className="banner banner--fehler" role="alert">
          <div>
            {fehler.map((f, i) => (
              <div key={i}>
                {f.field ? `${f.field}: ` : ''}
                {f.message}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="config__fuss">
        <button type="button" className="knopf knopf--primaer" disabled={beschaeftigt} onClick={onSpeichern}>
          {neu ? 'Vorlage anlegen' : 'Speichern'}
        </button>
        <button type="button" className="knopf knopf--sekundaer" disabled={beschaeftigt} onClick={onAbbrechen}>
          Abbrechen
        </button>
        {!neu && (
          <button
            type="button"
            className="knopf knopf--klein knopf--klein-gefahr"
            disabled={beschaeftigt || instanzen > 0}
            title={instanzen > 0 ? 'Es beruhen noch Instanzen auf dieser Vorlage' : undefined}
            onClick={() => {
              // Wie beim Löschen einer Instanz: nachfragen, bevor etwas
              // Unwiderrufliches passiert.
              if (confirm(`Vorlage „${definition.label}“ löschen?`)) onLoeschen();
            }}
          >
            Löschen
          </button>
        )}
      </div>

      <p className="hinweis">
        Änderungen wirken auf neue Instanzen sofort. Bestehende laufen unverändert weiter und werden als
        „Vorlage geändert“ markiert — erst ein Neuaufbau übernimmt den neuen Stand.
      </p>
    </div>
  );
}

// --- Umgebungsvariablen -----------------------------------------------------

function EnvAbschnitt({
  definition,
  onAendern,
}: {
  definition: TemplateDefinition;
  onAendern: (env: EnvMapping[]) => void;
}) {
  return (
    <Abschnitt
      titel="Umgebungsvariablen"
      anzahl={definition.env.length}
      hinweis="Hier entsteht die Container-Umgebung. Was hier fehlt, sieht der Server nicht."
    >
      <Liste
        eintraege={definition.env}
        leerText="noch keine Abbildung — ohne sie startet der Container ohne Konfiguration"
        neu={(): EnvMapping => ({
          name: 'NEUE_VARIABLE',
          source: { kind: 'const', value: '' },
          trim: false,
          omitWhenEmpty: false,
        })}
        onAendern={onAendern}
        zeichne={(mapping, aendern) => (
          <>
            <TextFeld label="Variable" wert={mapping.name} onAendern={(v) => aendern({ ...mapping, name: v })} />
            <WahlFeld
              label="Quelle"
              wert={mapping.source.kind}
              optionen={[
                { value: 'const', label: 'fester Wert' },
                { value: 'field', label: 'Formularfeld' },
                { value: 'port', label: 'Port' },
                { value: 'rconPassword', label: 'RCON-Passwort' },
                { value: 'timezone', label: 'Zeitzone' },
              ]}
              onAendern={(v) =>
                aendern({
                  ...mapping,
                  source:
                    v === 'const'
                      ? { kind: 'const', value: '' }
                      : v === 'field'
                        ? { kind: 'field', field: definition.fields[0]?.id ?? '' }
                        : v === 'port'
                          ? { kind: 'port', port: definition.ports[0]?.name ?? '' }
                          : v === 'rconPassword'
                            ? { kind: 'rconPassword' }
                            : { kind: 'timezone' },
                })
              }
            />
            {mapping.source.kind === 'const' && (
              <TextFeld
                label="Wert"
                wert={mapping.source.value}
                onAendern={(v) => aendern({ ...mapping, source: { kind: 'const', value: v } })}
              />
            )}
            {mapping.source.kind === 'field' && (
              <WahlFeld
                label="Feld"
                wert={mapping.source.field}
                optionen={definition.fields.map((f) => ({ value: f.id, label: `${f.label} (${f.id})` }))}
                onAendern={(v) => aendern({ ...mapping, source: { kind: 'field', field: v } })}
              />
            )}
            {mapping.source.kind === 'port' && (
              <WahlFeld
                label="Port"
                wert={mapping.source.port}
                optionen={definition.ports.map((p) => ({ value: p.name, label: `${p.label} (${p.name})` }))}
                onAendern={(v) => aendern({ ...mapping, source: { kind: 'port', port: v } })}
              />
            )}
            <TextFeld
              label="Ersatzwert"
              wert={mapping.fallback ?? ''}
              hilfe="Gilt, wenn die Quelle nichts liefert."
              onAendern={(v) => aendern({ ...mapping, fallback: v || undefined })}
            />
            <Schalter
              label="Ja/Nein übersetzen"
              wert={mapping.boolean !== undefined}
              hilfe="Nötig bei Ja/Nein-Feldern — Images erwarten TRUE, true oder eigene Werte."
              onAendern={(v) =>
                aendern({ ...mapping, boolean: v ? { whenTrue: 'true', whenFalse: 'false' } : undefined })
              }
            />
            {mapping.boolean && (
              <>
                <TextFeld
                  label="Wert bei ja"
                  wert={mapping.boolean.whenTrue}
                  onAendern={(v) =>
                    aendern({ ...mapping, boolean: { ...mapping.boolean!, whenTrue: v } })
                  }
                />
                <TextFeld
                  label="Wert bei nein"
                  wert={mapping.boolean.whenFalse}
                  onAendern={(v) =>
                    aendern({ ...mapping, boolean: { ...mapping.boolean!, whenFalse: v } })
                  }
                />
              </>
            )}
            <Schalter
              label="Leer weglassen"
              wert={mapping.omitWhenEmpty}
              hilfe="Variable gar nicht setzen statt leer — richtig für optionale Passwörter."
              onAendern={(v) => aendern({ ...mapping, omitWhenEmpty: v })}
            />
            <Schalter
              label="Leerraum entfernen"
              wert={mapping.trim}
              onAendern={(v) => aendern({ ...mapping, trim: v })}
            />
          </>
        )}
      />
    </Abschnitt>
  );
}

// --- Log --------------------------------------------------------------------

function LogAbschnitt({
  definition,
  onAendern,
}: {
  definition: TemplateDefinition;
  onAendern: (definition: TemplateDefinition) => void;
}) {
  const [probe, setProbe] = useState('');
  const muster = definition.logPatterns;

  const setzeMuster = (teil: Partial<TemplateDefinition['logPatterns']>) =>
    onAendern({ ...definition, logPatterns: { ...muster, ...teil } });

  /**
   * Die Probe ist der wichtigste Teil des Editors. Ein falsches Muster fällt
   * sonst erst auf der Zielmaschine auf — dann, wenn keine Spieler erkannt
   * werden oder der Server ewig auf „Startet“ steht.
   */
  const ergebnis = useMemo(() => {
    if (!probe) return null;
    const pruefe = (spec: { source: string; flags: string } | undefined, name: string) => {
      if (!spec?.source) return { name, text: 'kein Muster' };
      try {
        const treffer = new RegExp(spec.source, spec.flags).exec(probe);
        if (!treffer) return { name, text: 'greift nicht' };
        return { name, text: treffer[1] !== undefined ? `Gruppe 1: „${treffer[1]}“` : 'greift' };
      } catch (err) {
        return { name, text: err instanceof Error ? err.message : 'ungültig' };
      }
    };
    const sauber = (() => {
      if (!muster.clean?.pattern.source) return null;
      try {
        const re = new RegExp(muster.clean.pattern.source, muster.clean.pattern.flags);
        return probe.replace(re, muster.clean.replacement).trimEnd();
      } catch {
        return 'ungültiges Muster';
      }
    })();
    return {
      zeilen: [pruefe(muster.join, 'Beitritt'), pruefe(muster.leave, 'Abgang'), pruefe(muster.ready, 'Start')],
      sauber,
    };
  }, [probe, muster]);

  return (
    <>
      <Abschnitt
        titel="Log-Muster"
        hinweis="Reguläre Ausdrücke ohne Schrägstriche. Bei Beitritt und Abgang muss Gruppe 1 der Spielername sein."
      >
      <TextFeld
        label="Beitritt"
        wert={muster.join.source}
        onAendern={(v) => setzeMuster({ join: { ...muster.join, source: v } })}
      />
      <TextFeld
        label="Abgang"
        wert={muster.leave?.source ?? ''}
        hilfe="Leer lassen, wenn das Spiel den Abgang nicht mit Namen protokolliert."
        onAendern={(v) => setzeMuster({ leave: v ? { source: v, flags: muster.leave?.flags ?? '' } : undefined })}
      />
      <TextFeld
        label="Server bereit"
        wert={muster.ready.source}
        hilfe="Ab dieser Zeile gilt die Instanz als Online."
        onAendern={(v) => setzeMuster({ ready: { ...muster.ready, source: v } })}
      />
      <TextFeld
        label="Zeilenanfang entfernen"
        wert={muster.clean?.pattern.source ?? ''}
        hilfe="Schneidet Zeitstempel und Präfixe ab — die Konsole zeigt die Zeit in eigener Spalte."
        onAendern={(v) =>
          setzeMuster({ clean: v ? { pattern: { source: v, flags: '' }, replacement: '' } : undefined })
        }
      />

      <div className="feld">
        <label className="feld__label">Probe</label>
        <div className="feld__eingabe">
          <input
            value={probe}
            placeholder="Eine echte Logzeile des Servers einfügen"
            onChange={(e) => setProbe(e.target.value)}
          />
          {ergebnis && (
            <div className="probe">
              {ergebnis.zeilen.map((z) => (
                <div className="probe__zeile" key={z.name}>
                  <span className="probe__name">{z.name}</span>
                  <span className={z.text.startsWith('greift n') || z.text === 'kein Muster' ? 'probe__aus' : 'probe__an'}>
                    {z.text}
                  </span>
                </div>
              ))}
              {ergebnis.sauber !== null && (
                <div className="probe__zeile">
                  <span className="probe__name">Bereinigt</span>
                  <span className="probe__an">{ergebnis.sauber}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      </Abschnitt>

      <Abschnitt
        titel="Beispielzeilen ohne Docker"
        hinweis="Mit GSP_RUNTIME=fake erzeugt das Panel diese Zeilen. Sie müssen zu den Mustern oben passen — sonst bliebe eine Instanz dort für immer auf „Startet“. Platzhalter: {time}, {name}, {n}."
      >
      <WahlFeld
        label="Zeitformat"
        wert={definition.fakeLog?.timeFormat ?? 'iso'}
        optionen={[
          { value: 'hms', label: '12:34:56' },
          { value: 'dmy', label: '09/09/2026 12:34:56' },
          { value: 'iso', label: '2026-09-09 12:34:56' },
        ]}
        onAendern={(v) =>
          onAendern({ ...definition, fakeLog: { ...leerFakeLog(definition), timeFormat: v } })
        }
      />
      {(['join', 'leave', 'ready', 'chatter'] as const).map((art) => (
        <TextFeld
          key={art}
          label={{ join: 'Beitritt', leave: 'Abgang', ready: 'Start', chatter: 'Beiläufig' }[art]}
          wert={definition.fakeLog?.[art] ?? ''}
          onAendern={(v) =>
            onAendern({ ...definition, fakeLog: { ...leerFakeLog(definition), [art]: v } })
          }
        />
      ))}
      </Abschnitt>
    </>
  );
}

function leerFakeLog(definition: TemplateDefinition): NonNullable<TemplateDefinition['fakeLog']> {
  return (
    definition.fakeLog ?? {
      timeFormat: 'iso',
      join: '',
      leave: '',
      ready: '',
      chatter: '',
    }
  );
}

// --- Prüfregeln -------------------------------------------------------------

function ValidierungsAbschnitt({
  definition,
  onAendern,
}: {
  definition: TemplateDefinition;
  onAendern: (regeln: ValidationRule[]) => void;
}) {
  const feldOptionen = definition.fields.map((f) => ({ value: f.id, label: `${f.label} (${f.id})` }));

  return (
    <Abschnitt titel="Zusätzliche Prüfungen" anzahl={definition.validations.length}>
    <Liste
      eintraege={definition.validations}
      leerText="keine — Pflichtfelder und Längen reichen meist"
      neu={(): ValidationRule => ({
        rule: 'required',
        field: definition.fields[0]?.id ?? '',
        message: 'Dieses Feld wird gebraucht',
      })}
      onAendern={onAendern}
      zeichne={(regel, aendern) => (
        <>
          <WahlFeld
            label="Art"
            wert={regel.rule}
            optionen={[
              { value: 'required', label: 'muss ausgefüllt sein' },
              { value: 'minLength', label: 'Mindestlänge' },
              { value: 'pattern', label: 'muss Muster entsprechen' },
              { value: 'notContainedIn', label: 'darf nicht in anderen Feldern vorkommen' },
            ]}
            onAendern={(v) => {
              const basis = { field: regel.field, message: regel.message };
              aendern(
                v === 'required'
                  ? { rule: 'required', ...basis }
                  : v === 'minLength'
                    ? { rule: 'minLength', ...basis, value: 5, onlyWhenSet: true }
                    : v === 'pattern'
                      ? { rule: 'pattern', ...basis, pattern: { source: '^.+$', flags: '' }, onlyWhenSet: true }
                      : { rule: 'notContainedIn', ...basis, fields: [], onlyWhenSet: true },
              );
            }}
          />
          <WahlFeld
            label="Feld"
            wert={regel.field}
            optionen={feldOptionen}
            onAendern={(v) => aendern({ ...regel, field: v })}
          />
          {regel.rule === 'minLength' && (
            <ZahlFeld label="Mindestens" wert={regel.value} onAendern={(v) => aendern({ ...regel, value: v })} />
          )}
          {regel.rule === 'pattern' && (
            <TextFeld
              label="Muster"
              wert={regel.pattern.source}
              onAendern={(v) => aendern({ ...regel, pattern: { ...regel.pattern, source: v } })}
            />
          )}
          {regel.rule === 'notContainedIn' && (
            <TextFeld
              label="Andere Felder"
              wert={regel.fields.join(', ')}
              hilfe="Komma-getrennte Feldkennungen."
              onAendern={(v) =>
                aendern({ ...regel, fields: v.split(',').map((f) => f.trim()).filter(Boolean) })
              }
            />
          )}
          {regel.rule !== 'required' && (
            <Schalter
              label="Nur wenn ausgefüllt"
              wert={regel.onlyWhenSet}
              onAendern={(v) => aendern({ ...regel, onlyWhenSet: v })}
            />
          )}
          <TextFeld label="Meldung" wert={regel.message} onAendern={(v) => aendern({ ...regel, message: v })} />
        </>
      )}
    />
    </Abschnitt>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LOG_BUFFER_LENGTH,
  TOPIC,
  clockHms,
  type Backup,
  type HostStatus,
  type Instance,
  type Job,
  type LogLine,
  type Mod,
  type SessionInfo,
  type TemplateDescriptor,
} from '@gsp/shared';
import { api, ApiError, setCsrfToken } from './api/client.js';
import { LiveConnection } from './api/ws.js';
import { Kopfzeile } from './components/Kopfzeile.js';
import { Sidebar } from './components/Sidebar.js';
import { Detailkopf } from './components/Detailkopf.js';
import { Reiterleiste, sichtbareTabs, type TabId } from './components/Reiterleiste.js';
import { useBestaetigung, type Frage } from './components/Bestaetigung.js';
import { Uebersicht } from './tabs/Uebersicht.js';
import { Konsole } from './tabs/Konsole.js';
import { Spieler } from './tabs/Spieler.js';
import { Backups } from './tabs/Backups.js';
import { Mods } from './tabs/Mods.js';
import { Config } from './tabs/Config.js';
import { Anmeldung } from './views/Anmeldung.js';
import { NeueInstanz } from './views/NeueInstanz.js';
import { Vorlagen } from './views/Vorlagen.js';

export function App() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [ersteinrichtung, setErsteinrichtung] = useState(false);
  const [geprueft, setGeprueft] = useState(false);

  // Beim Laden prüfen, ob bereits eine Sitzung besteht.
  useEffect(() => {
    void (async () => {
      try {
        const me = await api.me();
        setCsrfToken(me.csrfToken);
        setSession(me);
      } catch {
        const state = await api.authState().catch(() => ({ needsSetup: false }));
        setErsteinrichtung(state.needsSetup);
      } finally {
        setGeprueft(true);
      }
    })();
  }, []);

  if (!geprueft) return <div className="anmeldung" />;
  if (!session) {
    return <Anmeldung ersteinrichtung={ersteinrichtung} onAngemeldet={setSession} />;
  }
  return <Panel session={session} onAbmelden={() => setSession(null)} />;
}

function Panel({ session, onAbmelden }: { session: SessionInfo; onAbmelden: () => void }) {
  const [instanzen, setInstanzen] = useState<Instance[]>([]);
  const [vorlagen, setVorlagen] = useState<TemplateDescriptor[]>([]);
  const [host, setHost] = useState<HostStatus | null>(null);
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('overview');
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [mods, setMods] = useState<Mod[]>([]);
  const [dialogOffen, setDialogOffen] = useState(false);
  // Letzter Job je Instanz. Er bleibt nach dem Ende stehen, damit die
  // Aufbauansicht den Übergang „Job fertig → Server fährt hoch“ erkennt.
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  // Instanz, deren Aufbau der Dialog gerade begleitet.
  const [imAufbau, setImAufbau] = useState<string | null>(null);
  const [vorlagenOffen, setVorlagenOffen] = useState(false);
  const [beschaeftigt, setBeschaeftigt] = useState(false);
  const [notiz, setNotiz] = useState('');
  const [meldung, setMeldung] = useState<string | null>(null);

  const live = useRef<LiveConnection | null>(null);

  const instanz = useMemo(
    () => instanzen.find((i) => i.id === gewaehlt) ?? instanzen[0] ?? null,
    [instanzen, gewaehlt],
  );
  const vorlage = useMemo(
    () => (instanz ? (vorlagen.find((v) => v.id === instanz.game) ?? null) : null),
    [vorlagen, instanz],
  );

  const ladeInstanzen = useCallback(async () => {
    const antwort = await api.instances();
    setInstanzen(antwort.instances);
    setGewaehlt((alt) => alt ?? antwort.instances[0]?.id ?? null);
  }, []);

  const ladeVorlagen = useCallback(async () => {
    const antwort = await api.templates();
    setVorlagen(antwort.templates);
  }, []);

  // Erstdaten und Live-Verbindung.
  useEffect(() => {
    void ladeVorlagen();
    void api.host().then(setHost).catch(() => undefined);
    void ladeInstanzen();

    const verbindung = new LiveConnection();
    live.current = verbindung;
    verbindung.connect();
    verbindung.subscribe(TOPIC.metrics);
    verbindung.subscribe(TOPIC.events);
    verbindung.subscribe(TOPIC.jobs);

    const abmelden = verbindung.onMessage((nachricht) => {
      if (nachricht.type === 'metrics') {
        setHost(nachricht.host);
        if (nachricht.instances.length === 0) return;
        // Der Takt liefert nur die veränderlichen Teile — der Rest bleibt stehen.
        setInstanzen((alt) =>
          alt.map((eintrag) => {
            const neu = nachricht.instances.find((i) => i.id === eintrag.id);
            return neu ? { ...eintrag, ...neu } : eintrag;
          }),
        );
      } else if (nachricht.type === 'log') {
        setLogs((alt) => [...alt, ...nachricht.lines].slice(-LOG_BUFFER_LENGTH));
      } else if (nachricht.type === 'event') {
        setInstanzen((alt) =>
          alt.map((eintrag) =>
            eintrag.id === nachricht.instanceId
              ? { ...eintrag, events: [nachricht.event, ...eintrag.events].slice(0, 9) }
              : eintrag,
          ),
        );
      } else if (nachricht.type === 'instances-changed') {
        void ladeInstanzen();
      } else if (nachricht.type === 'job') {
        const job = nachricht.job;
        if (job.instanceId) {
          setJobs((alt) => ({ ...alt, [job.instanceId as string]: job }));
        }
        if (job.status === 'failed') {
          setMeldung(`${job.kind}: ${job.error ?? 'fehlgeschlagen'}`);
        }
        // Strukturänderungen wie ein fertig aufgesetzter Container sind der
        // Instanzliste sonst nicht anzusehen.
        if (job.status === 'done' || job.status === 'failed') void ladeInstanzen();
      }
    });

    return () => {
      abmelden();
      verbindung.close();
      live.current = null;
    };
  }, [ladeInstanzen, ladeVorlagen]);

  // Log-Abo folgt der gewählten Instanz.
  useEffect(() => {
    if (!instanz || !live.current) return;
    const topic = TOPIC.logs(instanz.id);
    setLogs([]);
    void api.logs(instanz.id).then((a) => setLogs(a.lines)).catch(() => setLogs([]));
    live.current.subscribe(topic);
    return () => live.current?.unsubscribe(topic);
  }, [instanz?.id]);

  // Reiterabhängige Daten nachladen.
  useEffect(() => {
    if (!instanz) return;
    if (tab === 'backups') void api.backups(instanz.id).then((a) => setBackups(a.backups)).catch(() => undefined);
    if (tab === 'mods') void api.mods(instanz.id).then((a) => setMods(a.mods)).catch(() => undefined);
  }, [tab, instanz?.id]);

  /** Führt eine Aktion aus, zeigt Fehler an und lädt die Instanzen neu. */
  const aktion = useCallback(
    async (fn: () => Promise<unknown>, danach?: () => Promise<unknown>) => {
      setBeschaeftigt(true);
      setMeldung(null);
      try {
        await fn();
        await danach?.();
        await ladeInstanzen();
      } catch (err) {
        setMeldung(err instanceof ApiError ? err.message : String(err));
      } finally {
        setBeschaeftigt(false);
      }
    },
    [ladeInstanzen],
  );

  const { frage, dialog: bestaetigung } = useBestaetigung();

  const tabs = instanz ? sichtbareTabs(instanz.capabilities) : [];
  // Wechselt die Instanz auf eine Vorlage ohne Mods, muss der Reiter zurück.
  useEffect(() => {
    if (instanz && !tabs.some((t) => t.id === tab)) setTab('overview');
  }, [instanz?.id]);

  return (
    <div className="seite">
      <Kopfzeile
        host={host}
        benutzer={session.username}
        vorlagenOffen={vorlagenOffen}
        onVorlagen={() => setVorlagenOffen((offen) => !offen)}
        onAbmelden={() => {
          void api.logout().finally(() => {
            setCsrfToken(null);
            onAbmelden();
          });
        }}
      />

      {host && !host.reachable && (
        <div className="banner banner--fehler" role="alert">
          Container-Backend nicht erreichbar: {host.error ?? 'unbekannter Fehler'}
        </div>
      )}
      {meldung && (
        <div className="banner banner--warnung" role="alert">
          <span style={{ flex: 1 }}>{meldung}</span>
          <button type="button" className="knopf knopf--klein" onClick={() => setMeldung(null)}>
            Schließen
          </button>
        </div>
      )}

      {/* Vorlagen liegen über den Instanzen und bekommen deshalb die ganze
          Fläche, statt sich als weiterer Reiter in eine Instanz zu drängen. */}
      {vorlagenOffen && (
        <Vorlagen
          onSchliessen={() => {
            setVorlagenOffen(false);
            // Eine geänderte Vorlage kann Felder und Fähigkeiten verschoben
            // haben — beides steckt in den Instanzansichten.
            void ladeVorlagen();
            void ladeInstanzen();
          }}
        />
      )}

      {/* `hidden` allein genügt nicht: das Attribut wird von der eigenen
          `display`-Regel der Klasse überstimmt und die Instanzansicht schiene
          unter der Vorlagenverwaltung durch. */}
      <div className="rumpf" hidden={vorlagenOffen} style={vorlagenOffen ? { display: 'none' } : undefined}>
        <Sidebar
          instanzen={instanzen}
          gewaehlt={instanz?.id ?? null}
          onWaehlen={(id) => {
            setGewaehlt(id);
            setNotiz('');
          }}
          onAnlegen={() => setDialogOffen(true)}
        />

        <main className="detail">
          {!instanz && (
            <section className="panel">
              <p className="leerzustand">
                // noch keine Instanz vorhanden — lege links eine aus einer Vorlage an
              </p>
            </section>
          )}

          {instanz && vorlage && (
            <>
              <Detailkopf
                instanz={instanz}
                job={jobs[instanz.id] ?? null}
                beschaeftigt={beschaeftigt}
                onStart={() => void aktion(() => api.start(instanz.id))}
                onStop={() =>
                  frage({
                    titel: 'Server stoppen?',
                    text: `„${instanz.name}“ wird heruntergefahren. Verbundene Spieler fliegen raus, laufende Runden brechen ab. Weltdaten bleiben erhalten.`,
                    knopf: 'Stoppen',
                    gefahr: true,
                    onJa: () => void aktion(() => api.stop(instanz.id)),
                  })
                }
                onNeustart={() =>
                  frage({
                    titel: 'Server neu starten?',
                    text: `„${instanz.name}“ fährt herunter und wieder hoch. Verbundene Spieler fliegen raus, laufende Runden brechen ab.`,
                    knopf: 'Neustart',
                    onJa: () => void aktion(() => api.restart(instanz.id)),
                  })
                }
                onBackup={() =>
                  void aktion(
                    () => api.createBackup(instanz.id),
                    () => api.backups(instanz.id).then((a) => setBackups(a.backups)),
                  )
                }
              />

              <Reiterleiste tabs={tabs} aktiv={tab} onWechseln={setTab} />

              {tab === 'overview' && <Uebersicht instanz={instanz} />}

              {tab === 'console' && (
                <Konsole
                  instanz={instanz}
                  vorlage={vorlage?.label ?? 'Diese Vorlage'}
                  zeilen={logs}
                  onBefehl={async (befehl) => {
                    try {
                      await api.command(instanz.id, befehl);
                    } catch (err) {
                      setLogs((alt) => [
                        ...alt,
                        {
                          time: clockHms(),
                          level: 'ERROR',
                          text: err instanceof Error ? err.message : String(err),
                        },
                      ]);
                    }
                  }}
                />
              )}

              {tab === 'players' && (
                <Spieler
                  instanz={instanz}
                  vorlage={vorlage?.label ?? 'dieser Vorlage'}
                  onKick={(name) => void aktion(() => api.kick(instanz.id, name))}
                  onBann={(name) => void aktion(() => api.ban(instanz.id, name))}
                  onAufheben={(name) => void aktion(() => api.unban(instanz.id, name))}
                />
              )}

              {tab === 'backups' && (
                <Backups
                  instanz={instanz}
                  backups={backups}
                  beschaeftigt={beschaeftigt}
                  onUpdate={() => void aktion(() => api.update(instanz.id))}
                  onErstellen={() =>
                    void aktion(
                      () => api.createBackup(instanz.id),
                      () => api.backups(instanz.id).then((a) => setBackups(a.backups)),
                    )
                  }
                  onWiederherstellen={(backup) =>
                    frage({
                      titel: 'Weltdaten wiederherstellen?',
                      text: `Die aktuelle Welt von „${instanz.name}“ wird durch den Stand aus ${backup.file} ersetzt.`,
                      knopf: 'Wiederherstellen',
                      gefahr: true,
                      onJa: () => void aktion(() => api.restoreBackup(instanz.id, backup.id)),
                    })
                  }
                  onLoeschen={(backup) =>
                    frage({
                      titel: 'Backup löschen?',
                      text: `${backup.file} wird endgültig entfernt.`,
                      knopf: 'Löschen',
                      gefahr: true,
                      onJa: () =>
                        void aktion(
                          () => api.deleteBackup(instanz.id, backup.id),
                          () => api.backups(instanz.id).then((a) => setBackups(a.backups)),
                        ),
                    })
                  }
                />
              )}

              {tab === 'mods' && (
                <Mods
                  instanz={instanz}
                  mods={mods}
                  endungen={vorlage?.modExtensions ?? []}
                  onUmschalten={(mod) =>
                    void aktion(
                      () => api.setModEnabled(instanz.id, mod.file, !mod.enabled),
                      () => api.mods(instanz.id).then((a) => setMods(a.mods)),
                    )
                  }
                  onLoeschen={(mod) =>
                    frage({
                      titel: 'Mod entfernen?',
                      text: `${mod.name} wird aus „${instanz.name}“ gelöscht. Beim nächsten Neustart fehlt der Mod dem Server.`,
                      knopf: 'Entfernen',
                      onJa: () =>
                        void aktion(
                          () => api.deleteMod(instanz.id, mod.file),
                          () => api.mods(instanz.id).then((a) => setMods(a.mods)),
                        ),
                    })
                  }
                  onHinzufuegen={(datei) =>
                    void aktion(
                      () => api.uploadMod(instanz.id, datei),
                      () => api.mods(instanz.id).then((a) => setMods(a.mods)),
                    )
                  }
                />
              )}

              {tab === 'settings' && (
                <Config
                  instanz={instanz}
                  vorlage={vorlage}
                  notiz={notiz}
                  beschaeftigt={beschaeftigt}
                  onSpeichern={(werte, neustart) =>
                    void aktion(async () => {
                      await api.saveSettings(instanz.id, werte, neustart);
                      setNotiz(
                        neustart
                          ? `✓ gespeichert · Neustart um ${clockHms().slice(0, 5)}`
                          : '✓ gespeichert · wird beim nächsten Neustart wirksam',
                      );
                    })
                  }
                />
              )}

              <InstanzLoeschen
                instanz={instanz}
                frage={frage}
                onLoeschen={(daten) =>
                  void aktion(async () => {
                    await api.deleteInstance(instanz.id, daten);
                    setGewaehlt(null);
                  })
                }
              />
            </>
          )}
        </main>
      </div>

      {bestaetigung}

      {dialogOffen && (
        <NeueInstanz
          vorlagen={vorlagen}
          aufbauInstanz={imAufbau ? (instanzen.find((i) => i.id === imAufbau) ?? null) : null}
          aufbauJob={imAufbau ? (jobs[imAufbau] ?? null) : null}
          aufbauLogs={logs}
          onSchliessen={() => {
            setDialogOffen(false);
            setImAufbau(null);
          }}
          onAngelegt={(id) => {
            // Der Dialog bleibt stehen und zeigt den Aufbau. Die Instanz wird
            // sofort gewählt, damit das Log-Abo greift und die Aufbauansicht
            // mitlaufende Zeilen bekommt.
            setImAufbau(id);
            setGewaehlt(id);
            void ladeInstanzen();
          }}
        />
      )}
    </div>
  );
}

function InstanzLoeschen({
  instanz,
  frage,
  onLoeschen,
}: {
  instanz: Instance;
  frage: (f: Frage) => void;
  onLoeschen: (daten: boolean) => void;
}) {
  return (
    <section style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-4)', alignItems: 'center' }}>
      <span className="kachel__label" style={{ flex: 1 }}>
        // Instanz entfernen
      </span>
      <button
        type="button"
        className="knopf knopf--klein"
        onClick={() =>
          frage({
            titel: 'Container entfernen?',
            text: `Der Container von „${instanz.name}“ wird gelöscht. Die Weltdaten bleiben auf der Platte und stehen beim nächsten Start wieder bereit.`,
            knopf: 'Entfernen',
            onJa: () => onLoeschen(false),
          })
        }
      >
        Container entfernen
      </button>
      <button
        type="button"
        className="knopf knopf--klein knopf--klein-gefahr"
        onClick={() =>
          frage({
            titel: 'Mit Weltdaten löschen?',
            text: `„${instanz.name}“ wird mitsamt allen Weltdaten unwiderruflich gelöscht. Backups bleiben erhalten.`,
            knopf: 'Endgültig löschen',
            gefahr: true,
            tippen: 'löschen',
            onJa: () => onLoeschen(true),
          })
        }
      >
        Mit Weltdaten löschen
      </button>
    </section>
  );
}

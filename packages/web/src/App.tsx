import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LOG_BUFFER_LENGTH,
  TOPIC,
  clockHms,
  type Backup,
  type HostStatus,
  type Instance,
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
import { Uebersicht } from './tabs/Uebersicht.js';
import { Konsole } from './tabs/Konsole.js';
import { Spieler } from './tabs/Spieler.js';
import { Backups } from './tabs/Backups.js';
import { Mods } from './tabs/Mods.js';
import { Config } from './tabs/Config.js';
import { Anmeldung } from './views/Anmeldung.js';
import { NeueInstanz } from './views/NeueInstanz.js';

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

  // Erstdaten und Live-Verbindung.
  useEffect(() => {
    void api.templates().then((a) => setVorlagen(a.templates));
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
      } else if (nachricht.type === 'job' && nachricht.job.status === 'failed') {
        setMeldung(`${nachricht.job.kind}: ${nachricht.job.error ?? 'fehlgeschlagen'}`);
      }
    });

    return () => {
      abmelden();
      verbindung.close();
      live.current = null;
    };
  }, [ladeInstanzen]);

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

      <div className="rumpf">
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
                beschaeftigt={beschaeftigt}
                onStart={() => void aktion(() => api.start(instanz.id))}
                onStop={() => void aktion(() => api.stop(instanz.id))}
                onNeustart={() => void aktion(() => api.restart(instanz.id))}
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
                  onWiederherstellen={(backup) => {
                    if (!confirm(`Weltdaten aus ${backup.file} wiederherstellen? Die aktuelle Welt wird ersetzt.`)) return;
                    void aktion(() => api.restoreBackup(instanz.id, backup.id));
                  }}
                  onLoeschen={(backup) => {
                    if (!confirm(`${backup.file} endgültig löschen?`)) return;
                    void aktion(
                      () => api.deleteBackup(instanz.id, backup.id),
                      () => api.backups(instanz.id).then((a) => setBackups(a.backups)),
                    );
                  }}
                />
              )}

              {tab === 'mods' && (
                <Mods
                  instanz={instanz}
                  mods={mods}
                  onUmschalten={(mod) =>
                    void aktion(
                      () => api.setModEnabled(instanz.id, mod.file, !mod.enabled),
                      () => api.mods(instanz.id).then((a) => setMods(a.mods)),
                    )
                  }
                  onLoeschen={(mod) => {
                    if (!confirm(`${mod.name} entfernen?`)) return;
                    void aktion(
                      () => api.deleteMod(instanz.id, mod.file),
                      () => api.mods(instanz.id).then((a) => setMods(a.mods)),
                    );
                  }}
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

      {dialogOffen && (
        <NeueInstanz
          vorlagen={vorlagen}
          onSchliessen={() => setDialogOffen(false)}
          onAngelegt={(id) => {
            setDialogOffen(false);
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
  onLoeschen,
}: {
  instanz: Instance;
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
        onClick={() => {
          if (confirm(`Container von „${instanz.name}“ entfernen? Weltdaten bleiben erhalten.`)) {
            onLoeschen(false);
          }
        }}
      >
        Container entfernen
      </button>
      <button
        type="button"
        className="knopf knopf--klein knopf--klein-gefahr"
        onClick={() => {
          if (
            confirm(
              `„${instanz.name}“ mitsamt allen Weltdaten unwiderruflich löschen? Backups bleiben erhalten.`,
            )
          ) {
            onLoeschen(true);
          }
        }}
      >
        Mit Weltdaten löschen
      </button>
    </section>
  );
}

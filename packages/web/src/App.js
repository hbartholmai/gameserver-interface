import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LOG_BUFFER_LENGTH, TOPIC, clockHms, } from '@gsp/shared';
import { api, ApiError, setCsrfToken } from './api/client.js';
import { LiveConnection } from './api/ws.js';
import { Kopfzeile } from './components/Kopfzeile.js';
import { Sidebar } from './components/Sidebar.js';
import { Detailkopf } from './components/Detailkopf.js';
import { Reiterleiste, sichtbareTabs } from './components/Reiterleiste.js';
import { Uebersicht } from './tabs/Uebersicht.js';
import { Konsole } from './tabs/Konsole.js';
import { Spieler } from './tabs/Spieler.js';
import { Backups } from './tabs/Backups.js';
import { Mods } from './tabs/Mods.js';
import { Config } from './tabs/Config.js';
import { Anmeldung } from './views/Anmeldung.js';
import { NeueInstanz } from './views/NeueInstanz.js';
export function App() {
    const [session, setSession] = useState(null);
    const [ersteinrichtung, setErsteinrichtung] = useState(false);
    const [geprueft, setGeprueft] = useState(false);
    // Beim Laden prüfen, ob bereits eine Sitzung besteht.
    useEffect(() => {
        void (async () => {
            try {
                const me = await api.me();
                setCsrfToken(me.csrfToken);
                setSession(me);
            }
            catch {
                const state = await api.authState().catch(() => ({ needsSetup: false }));
                setErsteinrichtung(state.needsSetup);
            }
            finally {
                setGeprueft(true);
            }
        })();
    }, []);
    if (!geprueft)
        return _jsx("div", { className: "anmeldung" });
    if (!session) {
        return _jsx(Anmeldung, { ersteinrichtung: ersteinrichtung, onAngemeldet: setSession });
    }
    return _jsx(Panel, { session: session, onAbmelden: () => setSession(null) });
}
function Panel({ session, onAbmelden }) {
    const [instanzen, setInstanzen] = useState([]);
    const [vorlagen, setVorlagen] = useState([]);
    const [host, setHost] = useState(null);
    const [gewaehlt, setGewaehlt] = useState(null);
    const [tab, setTab] = useState('overview');
    const [logs, setLogs] = useState([]);
    const [backups, setBackups] = useState([]);
    const [mods, setMods] = useState([]);
    const [dialogOffen, setDialogOffen] = useState(false);
    const [beschaeftigt, setBeschaeftigt] = useState(false);
    const [notiz, setNotiz] = useState('');
    const [meldung, setMeldung] = useState(null);
    const live = useRef(null);
    const instanz = useMemo(() => instanzen.find((i) => i.id === gewaehlt) ?? instanzen[0] ?? null, [instanzen, gewaehlt]);
    const vorlage = useMemo(() => (instanz ? (vorlagen.find((v) => v.id === instanz.game) ?? null) : null), [vorlagen, instanz]);
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
                if (nachricht.instances.length === 0)
                    return;
                // Der Takt liefert nur die veränderlichen Teile — der Rest bleibt stehen.
                setInstanzen((alt) => alt.map((eintrag) => {
                    const neu = nachricht.instances.find((i) => i.id === eintrag.id);
                    return neu ? { ...eintrag, ...neu } : eintrag;
                }));
            }
            else if (nachricht.type === 'log') {
                setLogs((alt) => [...alt, ...nachricht.lines].slice(-LOG_BUFFER_LENGTH));
            }
            else if (nachricht.type === 'event') {
                setInstanzen((alt) => alt.map((eintrag) => eintrag.id === nachricht.instanceId
                    ? { ...eintrag, events: [nachricht.event, ...eintrag.events].slice(0, 9) }
                    : eintrag));
            }
            else if (nachricht.type === 'instances-changed') {
                void ladeInstanzen();
            }
            else if (nachricht.type === 'job' && nachricht.job.status === 'failed') {
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
        if (!instanz || !live.current)
            return;
        const topic = TOPIC.logs(instanz.id);
        setLogs([]);
        void api.logs(instanz.id).then((a) => setLogs(a.lines)).catch(() => setLogs([]));
        live.current.subscribe(topic);
        return () => live.current?.unsubscribe(topic);
    }, [instanz?.id]);
    // Reiterabhängige Daten nachladen.
    useEffect(() => {
        if (!instanz)
            return;
        if (tab === 'backups')
            void api.backups(instanz.id).then((a) => setBackups(a.backups)).catch(() => undefined);
        if (tab === 'mods')
            void api.mods(instanz.id).then((a) => setMods(a.mods)).catch(() => undefined);
    }, [tab, instanz?.id]);
    /** Führt eine Aktion aus, zeigt Fehler an und lädt die Instanzen neu. */
    const aktion = useCallback(async (fn, danach) => {
        setBeschaeftigt(true);
        setMeldung(null);
        try {
            await fn();
            await danach?.();
            await ladeInstanzen();
        }
        catch (err) {
            setMeldung(err instanceof ApiError ? err.message : String(err));
        }
        finally {
            setBeschaeftigt(false);
        }
    }, [ladeInstanzen]);
    const tabs = instanz ? sichtbareTabs(instanz.capabilities) : [];
    // Wechselt die Instanz auf eine Vorlage ohne Mods, muss der Reiter zurück.
    useEffect(() => {
        if (instanz && !tabs.some((t) => t.id === tab))
            setTab('overview');
    }, [instanz?.id]);
    return (_jsxs("div", { className: "seite", children: [_jsx(Kopfzeile, { host: host, benutzer: session.username, onAbmelden: () => {
                    void api.logout().finally(() => {
                        setCsrfToken(null);
                        onAbmelden();
                    });
                } }), host && !host.reachable && (_jsxs("div", { className: "banner banner--fehler", role: "alert", children: ["Container-Backend nicht erreichbar: ", host.error ?? 'unbekannter Fehler'] })), meldung && (_jsxs("div", { className: "banner banner--warnung", role: "alert", children: [_jsx("span", { style: { flex: 1 }, children: meldung }), _jsx("button", { type: "button", className: "knopf knopf--klein", onClick: () => setMeldung(null), children: "Schlie\u00DFen" })] })), _jsxs("div", { className: "rumpf", children: [_jsx(Sidebar, { instanzen: instanzen, gewaehlt: instanz?.id ?? null, onWaehlen: (id) => {
                            setGewaehlt(id);
                            setNotiz('');
                        }, onAnlegen: () => setDialogOffen(true) }), _jsxs("main", { className: "detail", children: [!instanz && (_jsx("section", { className: "panel", children: _jsx("p", { className: "leerzustand", children: "// noch keine Instanz vorhanden \u2014 lege links eine aus einer Vorlage an" }) })), instanz && vorlage && (_jsxs(_Fragment, { children: [_jsx(Detailkopf, { instanz: instanz, beschaeftigt: beschaeftigt, onStart: () => void aktion(() => api.start(instanz.id)), onStop: () => void aktion(() => api.stop(instanz.id)), onNeustart: () => void aktion(() => api.restart(instanz.id)), onBackup: () => void aktion(() => api.createBackup(instanz.id), () => api.backups(instanz.id).then((a) => setBackups(a.backups))) }), _jsx(Reiterleiste, { tabs: tabs, aktiv: tab, onWechseln: setTab }), tab === 'overview' && _jsx(Uebersicht, { instanz: instanz }), tab === 'console' && (_jsx(Konsole, { instanz: instanz, zeilen: logs, onBefehl: async (befehl) => {
                                            try {
                                                await api.command(instanz.id, befehl);
                                            }
                                            catch (err) {
                                                setLogs((alt) => [
                                                    ...alt,
                                                    {
                                                        time: clockHms(),
                                                        level: 'ERROR',
                                                        text: err instanceof Error ? err.message : String(err),
                                                    },
                                                ]);
                                            }
                                        } })), tab === 'players' && (_jsx(Spieler, { instanz: instanz, onKick: (name) => void aktion(() => api.kick(instanz.id, name)), onBann: (name) => void aktion(() => api.ban(instanz.id, name)), onAufheben: (name) => void aktion(() => api.unban(instanz.id, name)) })), tab === 'backups' && (_jsx(Backups, { instanz: instanz, backups: backups, beschaeftigt: beschaeftigt, onUpdate: () => void aktion(() => api.update(instanz.id)), onErstellen: () => void aktion(() => api.createBackup(instanz.id), () => api.backups(instanz.id).then((a) => setBackups(a.backups))), onWiederherstellen: (backup) => {
                                            if (!confirm(`Weltdaten aus ${backup.file} wiederherstellen? Die aktuelle Welt wird ersetzt.`))
                                                return;
                                            void aktion(() => api.restoreBackup(instanz.id, backup.id));
                                        }, onLoeschen: (backup) => {
                                            if (!confirm(`${backup.file} endgültig löschen?`))
                                                return;
                                            void aktion(() => api.deleteBackup(instanz.id, backup.id), () => api.backups(instanz.id).then((a) => setBackups(a.backups)));
                                        } })), tab === 'mods' && (_jsx(Mods, { instanz: instanz, mods: mods, onUmschalten: (mod) => void aktion(() => api.setModEnabled(instanz.id, mod.file, !mod.enabled), () => api.mods(instanz.id).then((a) => setMods(a.mods))), onLoeschen: (mod) => {
                                            if (!confirm(`${mod.name} entfernen?`))
                                                return;
                                            void aktion(() => api.deleteMod(instanz.id, mod.file), () => api.mods(instanz.id).then((a) => setMods(a.mods)));
                                        }, onHinzufuegen: (datei) => void aktion(() => api.uploadMod(instanz.id, datei), () => api.mods(instanz.id).then((a) => setMods(a.mods))) })), tab === 'settings' && (_jsx(Config, { instanz: instanz, vorlage: vorlage, notiz: notiz, beschaeftigt: beschaeftigt, onSpeichern: (werte, neustart) => void aktion(async () => {
                                            await api.saveSettings(instanz.id, werte, neustart);
                                            setNotiz(neustart
                                                ? `✓ gespeichert · Neustart um ${clockHms().slice(0, 5)}`
                                                : '✓ gespeichert · wird beim nächsten Neustart wirksam');
                                        }) })), _jsx(InstanzLoeschen, { instanz: instanz, onLoeschen: (daten) => void aktion(async () => {
                                            await api.deleteInstance(instanz.id, daten);
                                            setGewaehlt(null);
                                        }) })] }))] })] }), dialogOffen && (_jsx(NeueInstanz, { vorlagen: vorlagen, onSchliessen: () => setDialogOffen(false), onAngelegt: (id) => {
                    setDialogOffen(false);
                    setGewaehlt(id);
                    void ladeInstanzen();
                } }))] }));
}
function InstanzLoeschen({ instanz, onLoeschen, }) {
    return (_jsxs("section", { style: { display: 'flex', flexWrap: 'wrap', gap: 'var(--s-4)', alignItems: 'center' }, children: [_jsx("span", { className: "kachel__label", style: { flex: 1 }, children: "// Instanz entfernen" }), _jsx("button", { type: "button", className: "knopf knopf--klein", onClick: () => {
                    if (confirm(`Container von „${instanz.name}“ entfernen? Weltdaten bleiben erhalten.`)) {
                        onLoeschen(false);
                    }
                }, children: "Container entfernen" }), _jsx("button", { type: "button", className: "knopf knopf--klein knopf--klein-gefahr", onClick: () => {
                    if (confirm(`„${instanz.name}“ mitsamt allen Weltdaten unwiderruflich löschen? Backups bleiben erhalten.`)) {
                        onLoeschen(true);
                    }
                }, children: "Mit Weltdaten l\u00F6schen" })] }));
}
//# sourceMappingURL=App.js.map
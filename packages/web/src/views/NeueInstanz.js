import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../api/client.js';
import { Feld } from '../components/Feld.js';
import { SektionsLabel } from '../components/basis.js';
/** Vorbelegung aus den Feld-Defaults der gewählten Vorlage. */
function defaults(vorlage) {
    const werte = {};
    for (const feld of vorlage.fields) {
        if (feld.default !== undefined)
            werte[feld.id] = feld.default;
        else if (feld.type === 'boolean')
            werte[feld.id] = false;
        else if (feld.type === 'number')
            werte[feld.id] = feld.min ?? 0;
        else
            werte[feld.id] = '';
    }
    return werte;
}
export function NeueInstanz({ vorlagen, onSchliessen, onAngelegt, }) {
    const [gewaehlt, setGewaehlt] = useState(null);
    const [name, setName] = useState('');
    const [werte, setWerte] = useState({});
    const [ports, setPorts] = useState({});
    const [memoryMb, setMemoryMb] = useState(4096);
    const [cpus, setCpus] = useState(2);
    const [backupCron, setBackupCron] = useState('0 4 * * *');
    const [keepDays, setKeepDays] = useState(7);
    const [fehler, setFehler] = useState({});
    const [meldung, setMeldung] = useState(null);
    const [sendet, setSendet] = useState(false);
    const vorlage = useMemo(() => vorlagen.find((v) => v.id === gewaehlt) ?? null, [vorlagen, gewaehlt]);
    // Vorlagenwechsel setzt Formular, Ressourcen und freie Ports neu.
    useEffect(() => {
        if (!vorlage)
            return;
        setWerte(defaults(vorlage));
        setMemoryMb(vorlage.defaultMemoryMb);
        setCpus(vorlage.defaultCpus);
        setFehler({});
        setMeldung(null);
        void api
            .suggestedPorts(vorlage.id)
            .then((antwort) => setPorts(antwort.ports))
            .catch(() => {
            const vorgabe = {};
            for (const port of vorlage.ports) {
                if (!port.internalOnly)
                    vorgabe[port.name] = port.defaultHost;
            }
            setPorts(vorgabe);
        });
    }, [vorlage]);
    const absenden = async () => {
        if (!vorlage)
            return;
        if (!name.trim()) {
            setFehler({ name: 'Ein Name ist erforderlich' });
            return;
        }
        setSendet(true);
        setMeldung(null);
        setFehler({});
        const anfrage = {
            game: vorlage.id,
            name: name.trim(),
            tag: vorlage.defaultTag,
            ports: Object.entries(ports).map(([portName, host]) => ({ name: portName, host })),
            memoryMb,
            cpus,
            settings: werte,
            backupCron,
            backupKeepDays: keepDays,
        };
        try {
            const antwort = await api.createInstance(anfrage);
            onAngelegt(antwort.id);
        }
        catch (err) {
            if (err instanceof ApiError && err.fields.length > 0) {
                const felder = {};
                for (const eintrag of err.fields)
                    felder[eintrag.field] = eintrag.message;
                setFehler(felder);
                setMeldung(err.message);
            }
            else {
                setMeldung(err instanceof Error ? err.message : 'Anlegen fehlgeschlagen');
            }
        }
        finally {
            setSendet(false);
        }
    };
    return (_jsx("div", { className: "dialog-hintergrund", role: "dialog", "aria-modal": "true", "aria-label": "Neue Instanz anlegen", onKeyDown: (event) => {
            if (event.key === 'Escape')
                onSchliessen();
        }, children: _jsxs("div", { className: "dialog", children: [_jsxs("div", { className: "dialog__kopf", children: [_jsx("h2", { className: "dialog__titel", children: "Neue Instanz" }), _jsx("button", { type: "button", className: "knopf knopf--klein", onClick: onSchliessen, children: "Schlie\u00DFen" })] }), _jsxs("div", { className: "dialog__koerper", children: [_jsxs("section", { style: { display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }, children: [_jsx(SektionsLabel, { text: "Vorlage" }), _jsx("div", { className: "vorlagenwahl", children: vorlagen.map((v) => (_jsxs("button", { type: "button", className: `vorlagenkarte${v.id === gewaehlt ? ' vorlagenkarte--gewaehlt' : ''}`, "aria-pressed": v.id === gewaehlt, onClick: () => setGewaehlt(v.id), children: [_jsx("span", { className: "vorlagenkarte__name", children: v.label }), _jsx("span", { className: "vorlagenkarte__text", children: v.summary })] }, v.id))) })] }), vorlage && (_jsxs(_Fragment, { children: [vorlage.notes.length > 0 && (_jsx("div", { className: "notizen", children: vorlage.notes.map((notiz) => (_jsx("span", { className: "notiz", children: notiz }, notiz))) })), _jsxs("section", { style: { display: 'flex', flexDirection: 'column', gap: 'var(--s-5)' }, children: [_jsx(SektionsLabel, { text: "Instanz" }), _jsxs("div", { className: "feld", children: [_jsx("label", { className: "feld__label", htmlFor: "instanzname", children: "Anzeigename *" }), _jsxs("div", { className: "feld__eingabe", children: [_jsx("input", { id: "instanzname", value: name, maxLength: 48, onChange: (event) => setName(event.target.value), placeholder: "z. B. Midgard", "aria-invalid": fehler.name ? true : undefined }), fehler.name && _jsx("span", { className: "feld__fehler", children: fehler.name })] })] }), vorlage.fields.map((feld) => (_jsx(Feld, { spec: feld, wert: werte[feld.id] ?? '', fehler: fehler[feld.id], onAendern: (wert) => setWerte((alt) => ({ ...alt, [feld.id]: wert })) }, feld.id)))] }), _jsxs("section", { style: { display: 'flex', flexDirection: 'column', gap: 'var(--s-5)' }, children: [_jsx(SektionsLabel, { text: "Ports & Ressourcen" }), vorlage.ports
                                            .filter((port) => !port.internalOnly)
                                            .map((port) => (_jsxs("div", { className: "feld", children: [_jsxs("label", { className: "feld__label", htmlFor: `port-${port.name}`, children: [port.label, " (", port.protocol, ")"] }), _jsx("div", { className: "feld__eingabe", children: _jsx("input", { id: `port-${port.name}`, type: "number", min: 1, max: 65535, value: ports[port.name] ?? port.defaultHost, onChange: (event) => setPorts((alt) => ({ ...alt, [port.name]: Number(event.target.value) })), "aria-invalid": fehler.ports ? true : undefined }) })] }, port.name))), fehler.ports && _jsx("span", { className: "feld__fehler", children: fehler.ports }), _jsx(ZahlFeld, { id: "ram", label: "Arbeitsspeicher (MB)", wert: memoryMb, min: 512, step: 512, onAendern: setMemoryMb }), _jsx(ZahlFeld, { id: "cpus", label: "CPU-Kerne", wert: cpus, min: 0.5, step: 0.5, onAendern: setCpus }), _jsxs("div", { className: "feld", children: [_jsx("label", { className: "feld__label", htmlFor: "backupcron", children: "Backup-Zeitplan" }), _jsxs("div", { className: "feld__eingabe", children: [_jsx("input", { id: "backupcron", value: backupCron, onChange: (event) => setBackupCron(event.target.value), placeholder: "0 4 * * *" }), _jsx("span", { className: "feld__hilfe", children: "Cron-Ausdruck. Leer lassen f\u00FCr keine automatischen Backups." })] })] }), _jsx(ZahlFeld, { id: "keep", label: "Aufbewahrung (Tage)", wert: keepDays, min: 1, step: 1, onAendern: setKeepDays })] })] }))] }), _jsxs("div", { className: "dialog__fuss", children: [_jsx("span", { className: "feld__fehler", children: meldung }), _jsxs("div", { style: { display: 'flex', gap: 'var(--s-3)' }, children: [_jsx("button", { type: "button", className: "knopf knopf--sekundaer", onClick: onSchliessen, children: "Abbrechen" }), _jsx("button", { type: "button", className: "knopf knopf--primaer", disabled: !vorlage || sendet, onClick: () => void absenden(), children: sendet ? 'Wird angelegt…' : 'Anlegen & starten' })] })] })] }) }));
}
function ZahlFeld({ id, label, wert, min, step, onAendern, }) {
    return (_jsxs("div", { className: "feld", children: [_jsx("label", { className: "feld__label", htmlFor: id, children: label }), _jsx("div", { className: "feld__eingabe", children: _jsx("input", { id: id, type: "number", min: min, step: step, value: wert, onChange: (event) => onAendern(Number(event.target.value)) }) })] }));
}
//# sourceMappingURL=NeueInstanz.js.map
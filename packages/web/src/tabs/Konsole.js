import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { SektionsLabel } from '../components/basis.js';
const FILTER = ['Alle', 'Info', 'Warn'];
export function Konsole({ instanz, zeilen, onBefehl, }) {
    const [filter, setFilter] = useState('Alle');
    const [befehl, setBefehl] = useState('');
    const [sendet, setSendet] = useState(false);
    const fenster = useRef(null);
    const schreibbar = instanz.capabilities.console === 'rcon';
    const sichtbar = zeilen.filter((zeile) => passt(zeile.level, filter));
    // Ans Ende scrollen, solange der Nutzer nicht selbst nach oben gescrollt hat.
    const amEnde = useRef(true);
    useEffect(() => {
        const el = fenster.current;
        if (el && amEnde.current)
            el.scrollTop = el.scrollHeight;
    }, [sichtbar.length]);
    const absenden = async (event) => {
        event.preventDefault();
        const text = befehl.trim();
        if (!text || sendet)
            return;
        setSendet(true);
        try {
            await onBefehl(text);
            setBefehl('');
        }
        finally {
            setSendet(false);
        }
    };
    return (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 'var(--s-5)' }, children: [_jsxs("div", { className: "konsole__kopf", children: [_jsx(SektionsLabel, { text: `Live-Konsole · ${instanz.name}` }), _jsx("div", { className: "chips", role: "group", "aria-label": "Logfilter", children: FILTER.map((option) => (_jsx("button", { type: "button", className: `chip${filter === option ? ' chip--aktiv' : ''}`, "aria-pressed": filter === option, onClick: () => setFilter(option), children: option }, option))) })] }), _jsxs("div", { className: "logfenster", ref: fenster, role: "log", "aria-live": "polite", onScroll: (event) => {
                    const el = event.currentTarget;
                    amEnde.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
                }, children: [sichtbar.length === 0 && _jsx("p", { className: "leerzustand", children: "// keine Logzeilen" }), sichtbar.map((zeile, index) => (_jsxs("div", { className: "logzeile", children: [_jsx("span", { className: "logzeile__zeit", children: zeile.time }), _jsx("span", { className: `logzeile__level logzeile__level--${zeile.level}`, children: zeile.level }), _jsx("span", { className: `logzeile__text${zeile.level === 'ERROR' ? ' logzeile__text--ERROR' : ''}`, children: zeile.text })] }, `${zeile.time}-${index}`)))] }), _jsxs("form", { className: "eingabezeile", onSubmit: (e) => void absenden(e), children: [_jsx("span", { className: "eingabezeile__pfeil", "aria-hidden": "true", children: ">" }), _jsx("input", { value: befehl, onChange: (e) => setBefehl(e.target.value), disabled: !schreibbar || sendet, placeholder: schreibbar ? 'Befehl eingeben, z. B. save-all' : 'Diese Vorlage nimmt keine Befehle entgegen', "aria-label": "Konsolenbefehl" }), _jsx("button", { type: "submit", className: "knopf knopf--primaer", disabled: !schreibbar || sendet, children: "Senden" })] }), !schreibbar && (_jsx("p", { className: "hinweis", children: instanz.game === 'valheim'
                    ? 'Valheim bietet kein RCON — Admin-Befehle gibt es nur in der Spielkonsole (F5).'
                    : 'Enshrouded bietet keine Serverkonsole — Verwaltung erfolgt im Spiel über eine Admin-Rolle.' }))] }));
}
function passt(level, filter) {
    if (filter === 'Alle')
        return true;
    if (filter === 'Info')
        return level === 'INFO' || level === 'CMD';
    // `Warn` zeigt auch Fehler — sie sind das, wonach man in dem Filter sucht.
    return level === 'WARN' || level === 'ERROR';
}
//# sourceMappingURL=Konsole.js.map
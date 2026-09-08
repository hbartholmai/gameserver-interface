import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Feld } from '../components/Feld.js';
import { SektionsLabel } from '../components/basis.js';
export function Config({ instanz, vorlage, notiz, beschaeftigt, onSpeichern, }) {
    const [werte, setWerte] = useState(instanz.settings);
    const [fehler, setFehler] = useState({});
    // Wechselt die Instanz, muss das Formular die Werte der neuen übernehmen.
    useEffect(() => {
        setWerte(instanz.settings);
        setFehler({});
    }, [instanz.id, instanz.settings]);
    const editierbar = vorlage.fields.filter((feld) => feld.editable);
    const absenden = (neustart) => {
        const offen = {};
        for (const feld of editierbar) {
            const wert = werte[feld.id];
            if (feld.required && (wert === '' || wert === undefined)) {
                offen[feld.id] = `${feld.label} ist erforderlich`;
            }
        }
        setFehler(offen);
        if (Object.keys(offen).length > 0)
            return;
        // Unveränderte Geheimnisse werden nicht mitgeschickt — sonst würde die
        // Maskierung „********“ als neues Passwort gespeichert.
        const nutzlast = {};
        for (const feld of editierbar) {
            const wert = werte[feld.id];
            if (wert === undefined)
                continue;
            if (feld.secret && wert === instanz.settings[feld.id])
                continue;
            nutzlast[feld.id] = wert;
        }
        onSpeichern(nutzlast, neustart);
    };
    return (_jsxs("div", { className: "config", children: [_jsx(SektionsLabel, { text: "Serverkonfiguration" }), editierbar.map((feld) => (_jsx(Feld, { spec: feld, wert: werte[feld.id] ?? '', fehler: fehler[feld.id], gesperrt: beschaeftigt, onAendern: (wert) => setWerte((alt) => ({ ...alt, [feld.id]: wert })) }, feld.id))), _jsxs("div", { className: "config__fuss", children: [_jsx("button", { type: "button", className: "knopf knopf--primaer", disabled: beschaeftigt, onClick: () => absenden(true), children: "Speichern & neu starten" }), _jsx("button", { type: "button", className: "knopf knopf--sekundaer", disabled: beschaeftigt, onClick: () => absenden(false), children: "Nur speichern" }), notiz && _jsx("span", { className: "config__notiz", children: notiz })] }), _jsx("p", { className: "hinweis", children: "Die Umgebung eines Containers l\u00E4sst sich nicht nachtr\u00E4glich \u00E4ndern. \u201ESpeichern & neu starten\u201C erzeugt den Container neu \u2014 die Weltdaten bleiben dabei erhalten. \u201ENur speichern\u201C \u00FCbernimmt die Werte erst beim n\u00E4chsten Neustart." })] }));
}
//# sourceMappingURL=Config.js.map
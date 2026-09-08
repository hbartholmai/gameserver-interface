import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { api, setCsrfToken } from '../api/client.js';
/**
 * Anmeldung und Ersteinrichtung teilen sich eine Maske. Existiert noch kein
 * Konto, wird stattdessen eines angelegt.
 */
export function Anmeldung({ ersteinrichtung, onAngemeldet, }) {
    const [benutzer, setBenutzer] = useState('');
    const [passwort, setPasswort] = useState('');
    const [fehler, setFehler] = useState(null);
    const [sendet, setSendet] = useState(false);
    const absenden = async (event) => {
        event.preventDefault();
        setSendet(true);
        setFehler(null);
        try {
            const session = ersteinrichtung
                ? await api.setup(benutzer, passwort)
                : await api.login(benutzer, passwort);
            setCsrfToken(session.csrfToken);
            onAngemeldet(session);
        }
        catch (err) {
            setFehler(err instanceof Error ? err.message : 'Anmeldung fehlgeschlagen');
        }
        finally {
            setSendet(false);
        }
    };
    return (_jsx("div", { className: "anmeldung", children: _jsxs("form", { className: "anmeldung__box", onSubmit: (e) => void absenden(e), children: [_jsxs("div", { className: "anmeldung__marke", children: [_jsx("span", { className: "kopfzeile__wuerfel", "aria-hidden": "true", children: "GS" }), _jsx("h1", { className: "kopfzeile__titel", children: "Server Control" })] }), _jsx("p", { className: "kachel__label", children: ersteinrichtung ? '// Ersteinrichtung — Administrator anlegen' : '// Anmeldung' }), _jsxs("div", { className: "feld__eingabe", children: [_jsx("label", { className: "feld__label", htmlFor: "benutzer", children: "Benutzername" }), _jsx("input", { id: "benutzer", value: benutzer, autoComplete: "username", onChange: (event) => setBenutzer(event.target.value), required: true })] }), _jsxs("div", { className: "feld__eingabe", children: [_jsx("label", { className: "feld__label", htmlFor: "passwort", children: "Passwort" }), _jsx("input", { id: "passwort", type: "password", value: passwort, autoComplete: ersteinrichtung ? 'new-password' : 'current-password', onChange: (event) => setPasswort(event.target.value), required: true }), ersteinrichtung && _jsx("span", { className: "feld__hilfe", children: "Mindestens 12 Zeichen." })] }), fehler && _jsx("span", { className: "feld__fehler", children: fehler }), _jsx("button", { type: "submit", className: "knopf knopf--primaer", disabled: sendet, children: sendet ? 'Bitte warten…' : ersteinrichtung ? 'Konto anlegen' : 'Anmelden' })] }) }));
}
//# sourceMappingURL=Anmeldung.js.map
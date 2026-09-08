import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { formatPercent } from '@gsp/shared';
export function Kopfzeile({ host, benutzer, onAbmelden, }) {
    return (_jsxs("header", { className: "kopfzeile", children: [_jsxs("div", { className: "kopfzeile__marke", children: [_jsx("span", { className: "kopfzeile__wuerfel", "aria-hidden": "true", children: "GS" }), _jsx("h1", { className: "kopfzeile__titel", children: "Server Control" }), _jsxs("span", { className: "kopfzeile__kontext", children: [host?.nodeLabel ?? 'node 01', " \u00B7 ", host?.runtime === 'fake' ? 'simuliert' : 'docker'] })] }), _jsxs("div", { className: "kopfzeile__kennzahlen", children: [_jsx(Kennzahl, { label: "Instanzen", wert: `${host?.instancesOnline ?? 0} / ${host?.instancesTotal ?? 0}`, akzent: true }), _jsx(Kennzahl, { label: "Spieler", wert: String(host?.playersTotal ?? 0) }), _jsx(Kennzahl, { label: "Host CPU", wert: formatPercent(host?.hostCpuPct ?? 0) }), _jsxs("button", { type: "button", className: "knopf knopf--sekundaer", onClick: onAbmelden, children: [benutzer, " \u00B7 Abmelden"] })] })] }));
}
function Kennzahl({ label, wert, akzent }) {
    return (_jsxs("div", { className: "kachel-klein", children: [_jsx("div", { className: "kachel-klein__label", children: label }), _jsx("div", { className: `kachel-klein__wert${akzent ? ' kachel-klein__wert--akzent' : ''}`, children: wert })] }));
}
//# sourceMappingURL=Kopfzeile.js.map
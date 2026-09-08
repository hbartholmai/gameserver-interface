import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { STATUS_COLOR } from '@gsp/shared';
export function SektionsLabel({ text, rechts }) {
    return (_jsxs("div", { className: "sektionslabel", children: [_jsxs("span", { children: ["// ", text] }), rechts !== undefined && _jsx("span", { children: rechts })] }));
}
export function StatusChip({ status }) {
    return (_jsx("span", { className: "status-chip", style: { color: STATUS_COLOR[status] }, children: status }));
}
export function Panel({ children, className }) {
    return _jsx("section", { className: className ? `panel ${className}` : 'panel', children: children });
}
export function Leerzustand({ text }) {
    return _jsxs("p", { className: "leerzustand", children: ["// ", text] });
}
/**
 * Sparkline nach Vorgabe des Designs: feste Koordinaten 0–100, Skalierung über
 * `preserveAspectRatio="none"`, Strichstärke unabhängig davon konstant.
 */
export function Sparkline({ werte, hoehe = 40, gefuellt = true, farbe = 'var(--akzent)', maximum, }) {
    const viewHeight = gefuellt ? 30 : 24;
    if (werte.length === 0)
        return _jsx("div", { style: { height: hoehe } });
    const max = Math.max(maximum ?? 0, ...werte, 1);
    const schritt = werte.length > 1 ? 100 / (werte.length - 1) : 100;
    const punkte = werte.map((wert, index) => {
        const x = index * schritt;
        const y = viewHeight - (Math.max(0, wert) / max) * viewHeight;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    return (_jsxs("svg", { viewBox: `0 0 100 ${viewHeight}`, preserveAspectRatio: "none", height: hoehe, width: "100%", "aria-hidden": "true", style: { display: 'block', marginTop: 'var(--s-3)' }, children: [gefuellt && (_jsx("polygon", { points: `0,${viewHeight} ${punkte.join(' ')} 100,${viewHeight}`, fill: "rgba(62,224,143,0.10)" })), _jsx("polyline", { points: punkte.join(' '), fill: "none", stroke: farbe, strokeWidth: "1.2", vectorEffect: "non-scaling-stroke" })] }));
}
export function Balken({ anteil, farbe = 'var(--akzent)' }) {
    const breite = Math.max(0, Math.min(100, anteil));
    return (_jsx("div", { className: "balken", children: _jsx("span", { style: { width: `${breite}%`, background: farbe } }) }));
}
export function KvListe({ eintraege }) {
    return (_jsx("div", { className: "kv-liste", children: eintraege.map(([schluessel, wert]) => (_jsxs("div", { className: "kv-zeile", children: [_jsx("span", { className: "kv-zeile__schluessel", children: schluessel }), _jsx("span", { className: "kv-zeile__wert", children: wert })] }, schluessel))) }));
}
//# sourceMappingURL=basis.js.map
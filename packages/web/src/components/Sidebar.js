import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { STATUS_COLOR, formatBytes, formatPercent, } from '@gsp/shared';
import { SektionsLabel, StatusChip } from './basis.js';
export function Sidebar({ instanzen, gewaehlt, onWaehlen, onAnlegen, }) {
    return (_jsxs("aside", { className: "sidebar", children: [_jsx(SektionsLabel, { text: "Instanzen", rechts: instanzen.length }), instanzen.map((instanz) => (_jsx(InstanzKarte, { instanz: instanz, gewaehlt: instanz.id === gewaehlt, onWaehlen: () => onWaehlen(instanz.id) }, instanz.id))), instanzen.length === 0 && (_jsx("p", { className: "leerzustand", children: "// noch keine Instanz angelegt" })), _jsx("button", { type: "button", className: "knopf knopf--gestrichelt", onClick: onAnlegen, children: "+ Instanz anlegen" })] }));
}
function InstanzKarte({ instanz, gewaehlt, onWaehlen, }) {
    const farbe = STATUS_COLOR[instanz.status];
    const cpu = instanz.metrics.cpuPct;
    return (_jsxs("button", { type: "button", className: "instanzkarte", onClick: onWaehlen, "aria-current": gewaehlt ? 'true' : undefined, children: [gewaehlt && _jsx("span", { className: "instanzkarte__auswahl" }), _jsx("span", { className: "instanzkarte__streifen", style: { background: farbe } }), _jsxs("span", { className: "instanzkarte__kopf", children: [_jsxs("span", { style: { minWidth: 0 }, children: [_jsx("span", { className: "instanzkarte__spiel", children: instanz.game }), _jsx("span", { className: "instanzkarte__name", children: instanz.name })] }), _jsx(StatusChip, { status: instanz.status })] }), _jsxs("span", { className: "instanzkarte__zeile", children: [_jsxs("span", { children: [instanz.players.length, " / ", instanz.maxPlayers, " Spieler"] }), _jsxs("span", { children: ["CPU ", formatPercent(cpu), " \u00B7 RAM ", formatBytes(instanz.metrics.memBytes)] })] }), _jsx("span", { className: "instanzkarte__balken", children: _jsx("span", { style: { width: `${Math.min(100, Math.max(0, cpu))}%`, background: farbe } }) })] }));
}
//# sourceMappingURL=Sidebar.js.map
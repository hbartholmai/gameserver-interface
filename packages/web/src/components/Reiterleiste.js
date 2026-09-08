import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const ALLE = [
    { id: 'overview', label: 'Übersicht' },
    { id: 'console', label: 'Konsole' },
    { id: 'players', label: 'Spieler' },
    { id: 'backups', label: 'Backups' },
    { id: 'mods', label: 'Mods' },
    { id: 'settings', label: 'Config' },
];
/**
 * Der Mod-Reiter entfällt bei Vorlagen ohne Mod-Unterstützung — ein leerer
 * Reiter wäre irreführend.
 */
export function sichtbareTabs(capabilities) {
    return ALLE.filter((tab) => tab.id !== 'mods' || capabilities.mods !== 'none');
}
export function Reiterleiste({ tabs, aktiv, onWechseln, }) {
    return (_jsx("nav", { className: "reiter", children: tabs.map((tab) => (_jsxs("button", { type: "button", className: "reiter__knopf", "aria-current": tab.id === aktiv ? 'page' : undefined, onClick: () => onWechseln(tab.id), children: [tab.id === aktiv && _jsx("span", { className: "reiter__aktiv-overlay" }), _jsx("span", { className: "reiter__label", children: tab.label })] }, tab.id))) }));
}
//# sourceMappingURL=Reiterleiste.js.map
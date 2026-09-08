import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRef } from 'react';
import { formatBytes } from '@gsp/shared';
import { Leerzustand, SektionsLabel } from '../components/basis.js';
export function Mods({ instanz, mods, onUmschalten, onLoeschen, onHinzufuegen, }) {
    const auswahl = useRef(null);
    const endung = instanz.capabilities.mods === 'bepinex' ? '.dll' : '.jar';
    return (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }, children: [_jsx(SektionsLabel, { text: "Mods & Plugins", rechts: mods.length }), _jsxs("div", { className: "zeilen", children: [mods.length === 0 && _jsx(Leerzustand, { text: "keine Mods installiert" }), mods.map((mod) => (_jsxs("div", { className: "zeile", children: [_jsx("span", { className: "zeile__name", title: mod.file, children: mod.name }), _jsx("span", { className: "zeile__version", children: mod.version }), _jsx("span", { className: `zeile__badge ${mod.updateAvailable
                                    ? 'zeile__badge--update'
                                    : mod.enabled
                                        ? 'zeile__badge--aktiv'
                                        : 'zeile__badge--aus'}`, children: mod.updateAvailable ? 'Update verfügbar' : mod.enabled ? 'aktiv' : 'deaktiviert' }), _jsx("span", { className: "zeile__meta", children: formatBytes(mod.sizeBytes) }), _jsx("button", { type: "button", className: "knopf knopf--klein zeile__toggle", onClick: () => onUmschalten(mod), children: mod.enabled ? 'Aus' : 'Ein' }), _jsx("button", { type: "button", className: "knopf knopf--klein knopf--klein-gefahr", onClick: () => onLoeschen(mod), children: "L\u00F6schen" })] }, mod.file)))] }), _jsx("input", { ref: auswahl, type: "file", accept: endung, hidden: true, onChange: (event) => {
                    const datei = event.target.files?.[0];
                    if (datei)
                        onHinzufuegen(datei);
                    event.target.value = '';
                } }), _jsxs("button", { type: "button", className: "knopf knopf--gestrichelt", onClick: () => auswahl.current?.click(), children: ["+ Mod hinzuf\u00FCgen (", endung, ")"] }), _jsx("p", { className: "hinweis", children: "\u00C4nderungen werden erst nach einem Neustart der Instanz wirksam. Ob f\u00FCr eine Mod eine neuere Version vorliegt, kann das Panel nicht pr\u00FCfen \u2014 es ist keine Mod-Quelle angebunden." })] }));
}
//# sourceMappingURL=Mods.js.map
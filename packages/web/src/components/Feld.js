import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Ein Formularfeld aus der Vorlagenbeschreibung. Wizard und Config-Reiter
 * teilen sich diese Darstellung, damit beide Ansichten identisch aussehen.
 */
export function Feld({ spec, wert, fehler, gesperrt, onAendern, }) {
    const id = `feld-${spec.id}`;
    const hilfeId = spec.help ? `${id}-hilfe` : undefined;
    const fehlerId = fehler ? `${id}-fehler` : undefined;
    const beschriftungen = [hilfeId, fehlerId].filter(Boolean).join(' ') || undefined;
    return (_jsxs("div", { className: "feld", children: [_jsxs("label", { className: "feld__label", htmlFor: id, children: [spec.label, spec.required && _jsx("span", { "aria-hidden": "true", children: " *" })] }), _jsxs("div", { className: "feld__eingabe", children: [spec.type === 'boolean' ? (_jsx("div", { className: "feld__schalter", children: _jsx("button", { type: "button", id: id, className: `knopf knopf--klein${wert === true ? ' chip--aktiv' : ''}`, "aria-pressed": wert === true, disabled: gesperrt, onClick: () => onAendern(!wert), children: wert ? 'aktiv' : 'inaktiv' }) })) : spec.type === 'select' ? (_jsx("select", { id: id, value: String(wert), disabled: gesperrt, "aria-describedby": beschriftungen, onChange: (event) => onAendern(event.target.value), children: (spec.options ?? []).map((option) => (_jsx("option", { value: option.value, children: option.label }, option.value))) })) : (_jsx("input", { id: id, type: spec.type === 'password' ? 'password' : spec.type === 'number' ? 'number' : 'text', value: String(wert), disabled: gesperrt, min: spec.min, max: spec.max, maxLength: spec.maxLength, placeholder: spec.placeholder, "aria-describedby": beschriftungen, "aria-invalid": fehler ? true : undefined, onChange: (event) => onAendern(spec.type === 'number' ? Number(event.target.value) : event.target.value) })), spec.help && (_jsx("span", { className: "feld__hilfe", id: hilfeId, children: spec.help })), fehler && (_jsx("span", { className: "feld__fehler", id: fehlerId, children: fehler }))] })] }));
}
//# sourceMappingURL=Feld.js.map
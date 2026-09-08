import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useState } from 'react';
import { STATUS_COLOR, formatPing } from '@gsp/shared';
export function Detailkopf({ instanz, beschaeftigt, onStart, onStop, onNeustart, onBackup, }) {
    const [kopiert, setKopiert] = useState(false);
    const farbe = STATUS_COLOR[instanz.status];
    const kopieren = async () => {
        try {
            await navigator.clipboard.writeText(instanz.address);
            setKopiert(true);
            window.setTimeout(() => setKopiert(false), 1600);
        }
        catch {
            // Ohne Clipboard-Freigabe bleibt die Adresse zum Markieren stehen.
        }
    };
    return (_jsxs("section", { className: "panel detailkopf", children: [_jsxs("div", { style: { minWidth: 0 }, children: [_jsxs("div", { className: "detailkopf__meta", children: [instanz.game, " \u00B7 ", instanz.version, " \u00B7 ", instanz.provider] }), _jsx("h2", { className: "detailkopf__name", children: instanz.name }), _jsxs("div", { className: "detailkopf__status", children: [_jsxs("span", { className: "detailkopf__chip", style: { color: farbe }, children: [_jsx("span", { className: "detailkopf__punkt" }), instanz.status] }), _jsx("span", { className: "detailkopf__adresse", children: instanz.address }), _jsx("button", { type: "button", className: "knopf knopf--klein", onClick: () => void kopieren(), children: kopiert ? 'kopiert' : 'copy' }), _jsx("span", { className: "detailkopf__trenner", children: "|" }), _jsxs("span", { children: ["PING ", formatPing(instanz.metrics.pingMs)] })] }), instanz.error && (_jsx("p", { className: "hinweis", style: { color: 'var(--gefahr)' }, children: instanz.error }))] }), _jsxs("div", { className: "detailkopf__aktionen", children: [_jsx("button", { type: "button", className: "knopf knopf--primaer", disabled: beschaeftigt, onClick: instanz.running ? onStop : onStart, children: instanz.running ? 'Stoppen' : 'Starten' }), _jsx("button", { type: "button", className: "knopf knopf--sekundaer", disabled: beschaeftigt, onClick: onNeustart, children: "Neustart" }), _jsx("button", { type: "button", className: "knopf knopf--sekundaer", disabled: beschaeftigt, onClick: onBackup, children: "Backup" })] })] }));
}
//# sourceMappingURL=Detailkopf.js.map
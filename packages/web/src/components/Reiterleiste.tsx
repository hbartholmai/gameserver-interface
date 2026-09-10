import type { Capabilities } from '@gsp/shared';

export type TabId = 'overview' | 'console' | 'players' | 'welt' | 'backups' | 'mods' | 'settings';

const ALLE: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Übersicht' },
  { id: 'console', label: 'Konsole' },
  { id: 'players', label: 'Spieler' },
  // Vor „Backups“: beide handeln von denselben Daten, und die Welt ist das
  // Konkrete, das Backup die Ableitung davon.
  { id: 'welt', label: 'Welt' },
  { id: 'backups', label: 'Backups' },
  { id: 'mods', label: 'Mods' },
  { id: 'settings', label: 'Config' },
];

/**
 * Zwei Reiter entfallen, weil sie sonst etwas Falsches versprächen: Mods bei
 * Vorlagen ohne Mod-Unterstützung, Welt bei Vorlagen ohne Weltdaten — CS2, TF2
 * und Garry's Mod sichern nur cfg-Verzeichnisse.
 */
export function sichtbareTabs(
  capabilities: Capabilities,
  hatWelt: boolean,
): { id: TabId; label: string }[] {
  return ALLE.filter(
    (tab) =>
      (tab.id !== 'mods' || capabilities.mods !== 'none') && (tab.id !== 'welt' || hatWelt),
  );
}

export function Reiterleiste({
  tabs,
  aktiv,
  onWechseln,
}: {
  tabs: { id: TabId; label: string }[];
  aktiv: TabId;
  onWechseln: (id: TabId) => void;
}) {
  return (
    <nav className="reiter">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className="reiter__knopf"
          aria-current={tab.id === aktiv ? 'page' : undefined}
          onClick={() => onWechseln(tab.id)}
        >
          {tab.id === aktiv && <span className="reiter__aktiv-overlay" />}
          <span className="reiter__label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}

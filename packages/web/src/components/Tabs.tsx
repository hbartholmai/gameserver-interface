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
export function visibleTabs(
  capabilities: Capabilities,
  hatWelt: boolean,
): { id: TabId; label: string }[] {
  return ALLE.filter(
    (tab) =>
      (tab.id !== 'mods' || capabilities.mods !== 'none') && (tab.id !== 'welt' || hatWelt),
  );
}

export function TabBar({
  tabs,
  aktiv,
  onSwitch,
}: {
  tabs: { id: TabId; label: string }[];
  aktiv: TabId;
  onSwitch: (id: TabId) => void;
}) {
  return (
    <nav className="tab">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className="tab__button"
          aria-current={tab.id === aktiv ? 'page' : undefined}
          onClick={() => onSwitch(tab.id)}
        >
          {tab.id === aktiv && <span className="tab__active-overlay" />}
          <span className="tab__label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}

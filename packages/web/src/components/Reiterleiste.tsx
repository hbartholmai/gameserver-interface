import type { Capabilities } from '@gsp/shared';

export type TabId = 'overview' | 'console' | 'players' | 'backups' | 'mods' | 'settings';

const ALLE: { id: TabId; label: string }[] = [
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
export function sichtbareTabs(capabilities: Capabilities): { id: TabId; label: string }[] {
  return ALLE.filter((tab) => tab.id !== 'mods' || capabilities.mods !== 'none');
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

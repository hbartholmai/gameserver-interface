import { PANEL_VERSION, formatPercent, type HostStatus } from '@gsp/shared';

export function Header({
  host,
  user,
  templatesOpen,
  onTemplates,
  onLogout,
}: {
  host: HostStatus | null;
  user: string;
  templatesOpen: boolean;
  onTemplates: () => void;
  onLogout: () => void;
}) {
  return (
    <header className="header">
      <div className="header__brand">
        <span className="header__cube" aria-hidden="true">
          GS
        </span>
        <h1 className="header__title">Server Control</h1>
        <span className="header__context">
          {/* Die Fassung zuerst: Sie beantwortet die Frage, die man beim
              Melden eines Fehlers zuerst gestellt bekommt. */}
          <span className="header__version">{PANEL_VERSION}</span> ·{' '}
          {host?.nodeLabel ?? 'node 01'} · {host?.runtime === 'fake' ? 'simuliert' : 'docker'}
        </span>
      </div>

      <div className="header__stats">
        <Kennzahl
          label="Instanzen"
          value={`${host?.instancesOnline ?? 0} / ${host?.instancesTotal ?? 0}`}
          akzent
        />
        <Kennzahl label="Spieler" value={String(host?.playersTotal ?? 0)} />
        <Kennzahl label="Host CPU" value={formatPercent(host?.hostCpuPct ?? 0)} />
        <button
          type="button"
          className={`button button--secondary${templatesOpen ? ' chip--active' : ''}`}
          aria-pressed={templatesOpen}
          onClick={onTemplates}
        >
          Vorlagen
        </button>
        <button type="button" className="button button--secondary" onClick={onLogout}>
          {user} · Abmelden
        </button>
      </div>
    </header>
  );
}

function Kennzahl({ label, value, akzent }: { label: string; value: string; akzent?: boolean }) {
  return (
    <div className="tile-small">
      <div className="tile-small__label">{label}</div>
      <div className={`tile-small__value${akzent ? ' tile-small__value--accent' : ''}`}>{value}</div>
    </div>
  );
}

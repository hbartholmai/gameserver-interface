import { formatPercent, type HostStatus } from '@gsp/shared';

export function Kopfzeile({
  host,
  benutzer,
  vorlagenOffen,
  onVorlagen,
  onAbmelden,
}: {
  host: HostStatus | null;
  benutzer: string;
  vorlagenOffen: boolean;
  onVorlagen: () => void;
  onAbmelden: () => void;
}) {
  return (
    <header className="kopfzeile">
      <div className="kopfzeile__marke">
        <span className="kopfzeile__wuerfel" aria-hidden="true">
          GS
        </span>
        <h1 className="kopfzeile__titel">Server Control</h1>
        <span className="kopfzeile__kontext">
          {host?.nodeLabel ?? 'node 01'} · {host?.runtime === 'fake' ? 'simuliert' : 'docker'}
        </span>
      </div>

      <div className="kopfzeile__kennzahlen">
        <Kennzahl
          label="Instanzen"
          wert={`${host?.instancesOnline ?? 0} / ${host?.instancesTotal ?? 0}`}
          akzent
        />
        <Kennzahl label="Spieler" wert={String(host?.playersTotal ?? 0)} />
        <Kennzahl label="Host CPU" wert={formatPercent(host?.hostCpuPct ?? 0)} />
        <button
          type="button"
          className={`knopf knopf--sekundaer${vorlagenOffen ? ' chip--aktiv' : ''}`}
          aria-pressed={vorlagenOffen}
          onClick={onVorlagen}
        >
          Vorlagen
        </button>
        <button type="button" className="knopf knopf--sekundaer" onClick={onAbmelden}>
          {benutzer} · Abmelden
        </button>
      </div>
    </header>
  );
}

function Kennzahl({ label, wert, akzent }: { label: string; wert: string; akzent?: boolean }) {
  return (
    <div className="kachel-klein">
      <div className="kachel-klein__label">{label}</div>
      <div className={`kachel-klein__wert${akzent ? ' kachel-klein__wert--akzent' : ''}`}>{wert}</div>
    </div>
  );
}

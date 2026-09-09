import {
  STATUS_COLOR,
  formatBytes,
  formatPercent,
  type Instance,
} from '@gsp/shared';
import { SektionsLabel, StatusChip } from './basis.js';

export function Sidebar({
  instanzen,
  gewaehlt,
  onWaehlen,
  onAnlegen,
}: {
  instanzen: Instance[];
  gewaehlt: string | null;
  onWaehlen: (id: string) => void;
  onAnlegen: () => void;
}) {
  return (
    <aside className="sidebar">
      <SektionsLabel text="Instanzen" rechts={instanzen.length} />

      {instanzen.map((instanz) => (
        <InstanzKarte
          key={instanz.id}
          instanz={instanz}
          gewaehlt={instanz.id === gewaehlt}
          onWaehlen={() => onWaehlen(instanz.id)}
        />
      ))}

      {instanzen.length === 0 && (
        <p className="leerzustand">// noch keine Instanz angelegt</p>
      )}

      <button type="button" className="knopf knopf--gestrichelt" onClick={onAnlegen}>
        + Instanz anlegen
      </button>
    </aside>
  );
}

function InstanzKarte({
  instanz,
  gewaehlt,
  onWaehlen,
}: {
  instanz: Instance;
  gewaehlt: boolean;
  onWaehlen: () => void;
}) {
  const farbe = STATUS_COLOR[instanz.status];
  const cpu = instanz.metrics.cpuPct;

  return (
    <button
      type="button"
      className="instanzkarte"
      onClick={onWaehlen}
      aria-current={gewaehlt ? 'true' : undefined}
    >
      {gewaehlt && <span className="instanzkarte__auswahl" />}
      <span className="instanzkarte__streifen" style={{ background: farbe }} />

      <span className="instanzkarte__kopf">
        <span style={{ minWidth: 0 }}>
          <span className="instanzkarte__spiel">{instanz.game}</span>
          <span className="instanzkarte__name">{instanz.name}</span>
        </span>
        <StatusChip status={instanz.status} />
      </span>

      <span className="instanzkarte__zeile">
        <span>
          {instanz.players.length} / {instanz.maxPlayers} Spieler
        </span>
        <span>
          CPU {formatPercent(cpu)} · RAM {formatBytes(instanz.metrics.memBytes)}
        </span>
      </span>

      <span className="instanzkarte__balken">
        <span style={{ width: `${Math.min(100, Math.max(0, cpu))}%`, background: farbe }} />
      </span>
    </button>
  );
}

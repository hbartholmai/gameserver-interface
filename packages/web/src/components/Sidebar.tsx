import {
  STATUS_COLOR,
  formatBytes,
  formatPercent,
  type Instance,
} from '@gsp/shared';
import { SectionLabel, StatusChip } from './basics.js';

export function Sidebar({
  instanzen,
  selected,
  onWaehlen,
  onAnlegen,
}: {
  instanzen: Instance[];
  selected: string | null;
  onWaehlen: (id: string) => void;
  onAnlegen: () => void;
}) {
  return (
    <aside className="sidebar">
      <SectionLabel text="Instanzen" right={instanzen.length} />

      {instanzen.map((instance) => (
        <InstanzKarte
          key={instance.id}
          instance={instance}
          selected={instance.id === selected}
          onWaehlen={() => onWaehlen(instance.id)}
        />
      ))}

      {instanzen.length === 0 && (
        <p className="empty">// noch keine Instanz angelegt</p>
      )}

      <button type="button" className="button button--dashed" onClick={onAnlegen}>
        + Instanz anlegen
      </button>
    </aside>
  );
}

function InstanzKarte({
  instance,
  selected,
  onWaehlen,
}: {
  instance: Instance;
  selected: boolean;
  onWaehlen: () => void;
}) {
  const farbe = STATUS_COLOR[instance.status];
  const cpu = instance.metrics.cpuPct;

  return (
    <button
      type="button"
      className="instancecard"
      onClick={onWaehlen}
      aria-current={selected ? 'true' : undefined}
    >
      {selected && <span className="instancecard__select" />}
      <span className="instancecard__stripe" style={{ background: farbe }} />

      <span className="instancecard__head">
        <span style={{ minWidth: 0 }}>
          <span className="instancecard__game">{instance.game}</span>
          <span className="instancecard__name">{instance.name}</span>
        </span>
        <StatusChip status={instance.status} />
      </span>

      <span className="instancecard__row">
        <span>
          {instance.players.length} / {instance.maxPlayers} Spieler
        </span>
        <span>
          CPU {formatPercent(cpu)} · RAM {formatBytes(instance.metrics.memBytes)}
        </span>
      </span>

      <span className="instancecard__bar">
        <span style={{ width: `${Math.min(100, Math.max(0, cpu))}%`, background: farbe }} />
      </span>
    </button>
  );
}

import {
  formatBytes,
  formatDecimal,
  formatPercent,
  formatRate,
  formatTimestamp,
  formatUptime,
  type Instance,
} from '@gsp/shared';
import { Bar, KvList, SectionLabel, Sparkline } from '../components/basics.js';

export function Overview({ instance }: { instance: Instance }) {
  const m = instance.metrics;
  const ramAnteil = m.memLimitBytes > 0 ? (m.memBytes / m.memLimitBytes) * 100 : 0;
  const diskAnteil = m.diskTotalBytes > 0 ? (m.diskUsedBytes / m.diskTotalBytes) * 100 : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-8)' }}>
      <section className="tilegrid">
        <Tile label="CPU" extra={`${formatDecimal(instance.cpus, 0)} vCPU`}>
          <div className="tile__value">{formatPercent(m.cpuPct)}</div>
          <Sparkline values={m.cpuHist} maximum={100} />
        </Tile>

        <Tile label="RAM" extra={formatBytes(m.memLimitBytes)}>
          <div className="tile__value">{formatBytes(m.memBytes)}</div>
          <Sparkline values={m.ramHist} maximum={m.memLimitBytes} />
        </Tile>

        <Tile label="Spieler" extra={`Peak ${m.peakPlayers}`}>
          <div className="tile__value">
            {instance.players.length} / {instance.maxPlayers}
          </div>
          <Sparkline values={m.playerHist} height={32} filled={false} maximum={instance.maxPlayers} />
          <div className="tile__foot">Ø {formatDecimal(m.avgPlayers24h)} über 24 h</div>
        </Tile>

        <Tile label="Speicher" extra={m.diskTotalBytes > 0 ? formatBytes(m.diskTotalBytes) : undefined}>
          <div className="tile__value">{formatBytes(m.diskUsedBytes)}</div>
          <Bar ratio={diskAnteil} />
          <div className="tile__foot">
            von {formatBytes(m.diskTotalBytes)} · World {formatBytes(m.worldSizeBytes)}
          </div>
        </Tile>

        <Tile label="Uptime / Netz">
          <div className="tile__value tile__value--medium">{formatUptime(m.uptimeSec)}</div>
          <div className="tile__foot">
            RX {formatRate(m.netRxBytesPerSec)} · TX {formatRate(m.netTxBytesPerSec)}
          </div>
          <div className="tile__foot">TICK {m.tps ?? '—'}</div>
        </Tile>

        <Tile label="Letztes Backup" extra={`${instance.backupCount} Snapshots`}>
          <div className="tile__value tile__value--small">{formatTimestamp(instance.lastBackupAt)}</div>
          <div className="tile__foot">
            {instance.lastBackupSizeBytes !== null ? formatBytes(instance.lastBackupSizeBytes) : '—'} ·{' '}
            {instance.backupSchedule}
          </div>
          <div className={`tile__foot${instance.updateAvailable ? ' tile__foot--warn' : ''}`}>
            {instance.updateNote}
          </div>
        </Tile>
      </section>

      <section className="columns">
        <div className="column">
          <SectionLabel text="Welt & Konfiguration" />
          <KvList entries={instance.facts} />
        </div>

        <div className="column">
          <SectionLabel text="Ereignisse" />
          <div className="events">
            {instance.events.length === 0 && <p className="empty">// noch keine Ereignisse</p>}
            {instance.events.map((ereignis, index) => (
              <div className="event" key={`${ereignis.time}-${index}`}>
                <span className="event__time">{ereignis.time}</span>
                <span className="event__text">{ereignis.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <UnusedRamHint ratio={ramAnteil} />
    </div>
  );
}

/** Weist darauf hin, wenn der Speicher der Instanz knapp wird. */
function UnusedRamHint({ ratio }: { ratio: number }) {
  if (ratio < 92) return null;
  return (
    <p className="hint hint--warn">
      Der Arbeitsspeicher ist zu {formatPercent(ratio)} ausgelastet — bei anhaltender Last droht ein
      Abbruch durch das Speicherlimit des Containers.
    </p>
  );
}

function Tile({
  label,
  extra,
  children,
}: {
  label: string;
  extra?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="tile">
      <div className="tile__head">
        <span className="tile__label">{label}</span>
        {extra && <span className="tile__extra">{extra}</span>}
      </div>
      {children}
    </div>
  );
}

import {
  formatBytes,
  formatDecimal,
  formatPercent,
  formatRate,
  formatTimestamp,
  formatUptime,
  type Instance,
} from '@gsp/shared';
import { Balken, KvListe, SektionsLabel, Sparkline } from '../components/basis.js';

export function Uebersicht({ instanz }: { instanz: Instance }) {
  const m = instanz.metrics;
  const ramAnteil = m.memLimitBytes > 0 ? (m.memBytes / m.memLimitBytes) * 100 : 0;
  const diskAnteil = m.diskTotalBytes > 0 ? (m.diskUsedBytes / m.diskTotalBytes) * 100 : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-8)' }}>
      <section className="kachelraster">
        <Kachel label="CPU" zusatz={`${formatDecimal(instanz.cpus, 0)} vCPU`}>
          <div className="kachel__wert">{formatPercent(m.cpuPct)}</div>
          <Sparkline werte={m.cpuHist} maximum={100} />
        </Kachel>

        <Kachel label="RAM" zusatz={formatBytes(m.memLimitBytes)}>
          <div className="kachel__wert">{formatBytes(m.memBytes)}</div>
          <Sparkline werte={m.ramHist} maximum={m.memLimitBytes} />
        </Kachel>

        <Kachel label="Spieler" zusatz={`Peak ${m.peakPlayers}`}>
          <div className="kachel__wert">
            {instanz.players.length} / {instanz.maxPlayers}
          </div>
          <Sparkline werte={m.playerHist} hoehe={32} gefuellt={false} maximum={instanz.maxPlayers} />
          <div className="kachel__fuss">Ø {formatDecimal(m.avgPlayers24h)} über 24 h</div>
        </Kachel>

        <Kachel label="Speicher" zusatz={m.diskTotalBytes > 0 ? formatBytes(m.diskTotalBytes) : undefined}>
          <div className="kachel__wert">{formatBytes(m.diskUsedBytes)}</div>
          <Balken anteil={diskAnteil} />
          <div className="kachel__fuss">
            von {formatBytes(m.diskTotalBytes)} · Welt {formatBytes(m.worldSizeBytes)}
          </div>
        </Kachel>

        <Kachel label="Uptime / Netz">
          <div className="kachel__wert kachel__wert--mittel">{formatUptime(m.uptimeSec)}</div>
          <div className="kachel__fuss">
            RX {formatRate(m.netRxBytesPerSec)} · TX {formatRate(m.netTxBytesPerSec)}
          </div>
          <div className="kachel__fuss">TICK {m.tps ?? '—'}</div>
        </Kachel>

        <Kachel label="Letztes Backup" zusatz={`${instanz.backupCount} Snapshots`}>
          <div className="kachel__wert kachel__wert--klein">{formatTimestamp(instanz.lastBackupAt)}</div>
          <div className="kachel__fuss">
            {instanz.lastBackupSizeBytes !== null ? formatBytes(instanz.lastBackupSizeBytes) : '—'} ·{' '}
            {instanz.backupSchedule}
          </div>
          <div className={`kachel__fuss${instanz.updateAvailable ? ' kachel__fuss--warnung' : ''}`}>
            {instanz.updateNote}
          </div>
        </Kachel>
      </section>

      <section className="spalten">
        <div className="spalte">
          <SektionsLabel text="Welt & Konfiguration" />
          <KvListe eintraege={instanz.facts} />
        </div>

        <div className="spalte">
          <SektionsLabel text="Ereignisse" />
          <div className="ereignisse">
            {instanz.events.length === 0 && <p className="leerzustand">// noch keine Ereignisse</p>}
            {instanz.events.map((ereignis, index) => (
              <div className="ereignis" key={`${ereignis.time}-${index}`}>
                <span className="ereignis__zeit">{ereignis.time}</span>
                <span className="ereignis__text">{ereignis.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <UnusedRamHint anteil={ramAnteil} />
    </div>
  );
}

/** Weist darauf hin, wenn der Speicher der Instanz knapp wird. */
function UnusedRamHint({ anteil }: { anteil: number }) {
  if (anteil < 92) return null;
  return (
    <p className="hinweis hinweis--warnung">
      Der Arbeitsspeicher ist zu {formatPercent(anteil)} ausgelastet — bei anhaltender Last droht ein
      Abbruch durch das Speicherlimit des Containers.
    </p>
  );
}

function Kachel({
  label,
  zusatz,
  children,
}: {
  label: string;
  zusatz?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="kachel">
      <div className="kachel__kopf">
        <span className="kachel__label">{label}</span>
        {zusatz && <span className="kachel__zusatz">{zusatz}</span>}
      </div>
      {children}
    </div>
  );
}

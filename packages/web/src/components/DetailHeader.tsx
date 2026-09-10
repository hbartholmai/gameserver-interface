import { useState } from 'react';
import { STATUS_COLOR, formatDauer, formatPing, type Instance, type Job } from '@gsp/shared';
import { ProgressRow } from './Progress.js';

export function DetailHeader({
  instance,
  job,
  busy,
  onStart,
  onStop,
  onRestart,
  onBackup,
}: {
  instance: Instance;
  /** Laufender Job dieser Instanz, damit der Aufbau auch außerhalb des Dialogs sichtbar bleibt. */
  job: Job | null;
  busy: boolean;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  onBackup: () => void;
}) {
  const [kopiert, setKopiert] = useState(false);
  const farbe = STATUS_COLOR[instance.status];

  const kopieren = async () => {
    try {
      await navigator.clipboard.writeText(instance.address);
      setKopiert(true);
      window.setTimeout(() => setKopiert(false), 1600);
    } catch {
      // Ohne Clipboard-Freigabe bleibt die Adresse zum Markieren stehen.
    }
  };

  return (
    <section className="panel detailhead">
      <div style={{ minWidth: 0 }}>
        <div className="detailhead__meta">
          {instance.game} · {instance.version} · {instance.provider}
        </div>
        <h2 className="detailhead__name">{instance.name}</h2>

        <div className="detailhead__status">
          <span className="detailhead__chip" style={{ color: farbe }}>
            <span className="detailhead__dot" />
            {instance.status}
          </span>
          <span className="detailhead__address">{instance.address}</span>
          <button type="button" className="button button--small" onClick={() => void kopieren()}>
            {kopiert ? 'kopiert' : 'copy'}
          </button>
          <span className="detailhead__divider">|</span>
          <span>PING {formatPing(instance.metrics.pingMs)}</span>
        </div>

        {job?.status === 'running' && (
          <div style={{ marginTop: 'var(--s-5)' }}>
            <ProgressRow job={job} />
          </div>
        )}

        {/* Nach dem Job kommt die Phase ohne Messwert: der Server erzeugt seine
            Welt. Statt eines erfundenen Balkens die Dauer des letzten Starts. */}
        {job?.status !== 'running' && instance.status === 'Startet' && (
          <p className="hint">
            Der Server fährt hoch — seit {formatDauer(instance.metrics.uptimeSec)}
            {instance.lastBootSec ? `, beim letzten Mal ${formatDauer(instance.lastBootSec)}` : ''}.
          </p>
        )}

        {/* Während eines laufenden Jobs ist „Container fehlt“ kein Fehler,
            sondern der Normalzustand vor dem Erstellen. */}
        {instance.error && job?.status !== 'running' && (
          <p className="hint" style={{ color: 'var(--gefahr)' }}>
            {instance.error}
          </p>
        )}
      </div>

      <div className="detailhead__actions">
        <button
          type="button"
          className="button button--primary"
          disabled={busy}
          onClick={instance.running ? onStop : onStart}
        >
          {instance.running ? 'Stoppen' : 'Starten'}
        </button>
        <button type="button" className="button button--secondary" disabled={busy} onClick={onRestart}>
          Neustart
        </button>
        <button type="button" className="button button--secondary" disabled={busy} onClick={onBackup}>
          Backup
        </button>
      </div>
    </section>
  );
}

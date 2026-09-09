import { useState } from 'react';
import { STATUS_COLOR, formatDauer, formatPing, type Instance, type Job } from '@gsp/shared';
import { Fortschrittszeile } from './Aufbau.js';

export function Detailkopf({
  instanz,
  job,
  beschaeftigt,
  onStart,
  onStop,
  onNeustart,
  onBackup,
}: {
  instanz: Instance;
  /** Laufender Job dieser Instanz, damit der Aufbau auch außerhalb des Dialogs sichtbar bleibt. */
  job: Job | null;
  beschaeftigt: boolean;
  onStart: () => void;
  onStop: () => void;
  onNeustart: () => void;
  onBackup: () => void;
}) {
  const [kopiert, setKopiert] = useState(false);
  const farbe = STATUS_COLOR[instanz.status];

  const kopieren = async () => {
    try {
      await navigator.clipboard.writeText(instanz.address);
      setKopiert(true);
      window.setTimeout(() => setKopiert(false), 1600);
    } catch {
      // Ohne Clipboard-Freigabe bleibt die Adresse zum Markieren stehen.
    }
  };

  return (
    <section className="panel detailkopf">
      <div style={{ minWidth: 0 }}>
        <div className="detailkopf__meta">
          {instanz.game} · {instanz.version} · {instanz.provider}
        </div>
        <h2 className="detailkopf__name">{instanz.name}</h2>

        <div className="detailkopf__status">
          <span className="detailkopf__chip" style={{ color: farbe }}>
            <span className="detailkopf__punkt" />
            {instanz.status}
          </span>
          <span className="detailkopf__adresse">{instanz.address}</span>
          <button type="button" className="knopf knopf--klein" onClick={() => void kopieren()}>
            {kopiert ? 'kopiert' : 'copy'}
          </button>
          <span className="detailkopf__trenner">|</span>
          <span>PING {formatPing(instanz.metrics.pingMs)}</span>
        </div>

        {job?.status === 'running' && (
          <div style={{ marginTop: 'var(--s-5)' }}>
            <Fortschrittszeile job={job} />
          </div>
        )}

        {/* Nach dem Job kommt die Phase ohne Messwert: der Server erzeugt seine
            Welt. Statt eines erfundenen Balkens die Dauer des letzten Starts. */}
        {job?.status !== 'running' && instanz.status === 'Startet' && (
          <p className="hinweis">
            Der Server fährt hoch — seit {formatDauer(instanz.metrics.uptimeSec)}
            {instanz.lastBootSec ? `, beim letzten Mal ${formatDauer(instanz.lastBootSec)}` : ''}.
          </p>
        )}

        {/* Während eines laufenden Jobs ist „Container fehlt“ kein Fehler,
            sondern der Normalzustand vor dem Erstellen. */}
        {instanz.error && job?.status !== 'running' && (
          <p className="hinweis" style={{ color: 'var(--gefahr)' }}>
            {instanz.error}
          </p>
        )}
      </div>

      <div className="detailkopf__aktionen">
        <button
          type="button"
          className="knopf knopf--primaer"
          disabled={beschaeftigt}
          onClick={instanz.running ? onStop : onStart}
        >
          {instanz.running ? 'Stoppen' : 'Starten'}
        </button>
        <button type="button" className="knopf knopf--sekundaer" disabled={beschaeftigt} onClick={onNeustart}>
          Neustart
        </button>
        <button type="button" className="knopf knopf--sekundaer" disabled={beschaeftigt} onClick={onBackup}>
          Backup
        </button>
      </div>
    </section>
  );
}

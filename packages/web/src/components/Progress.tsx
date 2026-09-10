import { formatBytes, formatDauer, type Instance, type Job, type LogLine } from '@gsp/shared';
import { Bar } from './basics.js';

/**
 * Der Aufbau einer Instanz besteht aus zwei Phasen mit sehr unterschiedlicher
 * Messbarkeit:
 *
 * 1. Image laden und Container erstellen — der Job meldet echte Prozentwerte
 *    und beim Pull sogar Byte-Zahlen.
 * 2. Der Server selbst fährt hoch, bis er seine Startmeldung ins Log schreibt.
 *    Dafür gibt es **keinen** Prozentsatz. Statt einen zu erfinden, zeigt die
 *    Ansicht verstrichene Zeit, die Dauer des letzten Starts als Anhaltspunkt
 *    und den mitlaufenden Log-Strom.
 */
export type Phase = 'job' | 'start' | 'fertig' | 'fehler';

export function phaseOf(job: Job | null, instance: Instance | null): Phase {
  // Solange der Job läuft, hat er Vorrang vor dem Instanzstatus. Während des
  // Image-Pulls existiert der Container noch gar nicht, weshalb die Instanz
  // korrekterweise „Fehler“ meldet — als Aufbaufortschritt wäre das falsch.
  if (job?.status === 'running') return 'job';
  if (job?.status === 'failed') return 'fehler';
  if (instance?.status === 'Online') return 'fertig';
  if (instance?.status === 'Fehler') return 'fehler';
  return 'start';
}

/** Eine Zeile Fortschritt — schmal genug für den Detailkopf und die Sidebar. */
export function ProgressRow({ job }: { job: Job }) {
  const prozent = job.progress;
  return (
    <div className="progress">
      <div className="progress__head">
        <span className="progress__phase">{job.message}</span>
        <span className="progress__count">{prozent === null ? '—' : `${Math.round(prozent)} %`}</span>
      </div>
      <Bar ratio={prozent ?? 0} />
      {job.bytesTotal !== null && job.bytesDone !== null && (
        <div className="progress__bytes">
          {formatBytes(job.bytesDone)} von {formatBytes(job.bytesTotal)}
        </div>
      )}
    </div>
  );
}

/**
 * Vollständige Aufbauansicht für den Anlege-Dialog: beide Phasen plus die
 * letzten Logzeilen, damit sichtbar ist, woran der Server gerade arbeitet.
 */
export function Build({
  instance,
  job,
  logs,
}: {
  instance: Instance | null;
  job: Job | null;
  logs: LogLine[];
}) {
  const phase = phaseOf(job, instance);
  const recent = logs.slice(-8);

  return (
    <div className="build">
      {phase === 'job' && job && <ProgressRow job={job} />}

      {phase === 'start' && (
        <div className="progress">
          <div className="progress__head">
            <span className="progress__phase">Server fährt hoch</span>
            <span className="progress__count">
              {formatDauer(instance?.metrics.uptimeSec ?? 0)}
            </span>
          </div>
          {/* Bewusst kein Balken: für diese Phase gibt es keinen Messwert, und
              ein hochlaufender Balken ohne Grundlage wäre eine Behauptung. */}
          <p className="progress__note">
            {instance?.lastBootSec
              ? `Der Server erzeugt seine Welt. Beim letzten Mal dauerte das ${formatDauer(instance.lastBootSec)}.`
              : 'Der Server erzeugt seine Welt. Wie lange das dauert, weiß das Panel erst nach dem ersten Start.'}
          </p>
        </div>
      )}

      {phase === 'fertig' && (
        <p className="progress__note progress__note--good">
          Der Server ist online
          {instance?.lastBootSec ? ` — Start in ${formatDauer(instance.lastBootSec)}` : ''}.
        </p>
      )}

      {phase === 'fehler' && (
        <p className="progress__note progress__note--error">
          {job?.error ?? instance?.error ?? 'Der Aufbau ist fehlgeschlagen.'}
        </p>
      )}

      {/* Immer gerendert, auch leer: sonst wächst der Dialog in dem Moment, in
          dem die erste Logzeile eintrifft, und springt unter dem Mauszeiger weg. */}
      <div className="build__log" aria-label="Letzte Logzeilen">
        {recent.length === 0 ? (
          <span className="build__empty">// noch keine Ausgabe</span>
        ) : (
          recent.map((line, index) => (
            <div className="build__line" key={`${line.time}-${index}`}>
              <span className="build__time">{line.time}</span>
              <span className={`build__text build__text--${line.level.toLowerCase()}`}>
                {line.text}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

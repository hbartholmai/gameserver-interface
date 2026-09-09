import { formatBytes, formatDauer, type Instance, type Job, type LogLine } from '@gsp/shared';
import { Balken } from './basis.js';

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

export function phaseVon(job: Job | null, instanz: Instance | null): Phase {
  // Solange der Job läuft, hat er Vorrang vor dem Instanzstatus. Während des
  // Image-Pulls existiert der Container noch gar nicht, weshalb die Instanz
  // korrekterweise „Fehler“ meldet — als Aufbaufortschritt wäre das falsch.
  if (job?.status === 'running') return 'job';
  if (job?.status === 'failed') return 'fehler';
  if (instanz?.status === 'Online') return 'fertig';
  if (instanz?.status === 'Fehler') return 'fehler';
  return 'start';
}

/** Eine Zeile Fortschritt — schmal genug für den Detailkopf und die Sidebar. */
export function Fortschrittszeile({ job }: { job: Job }) {
  const prozent = job.progress;
  return (
    <div className="fortschritt">
      <div className="fortschritt__kopf">
        <span className="fortschritt__phase">{job.message}</span>
        <span className="fortschritt__zahl">{prozent === null ? '—' : `${Math.round(prozent)} %`}</span>
      </div>
      <Balken anteil={prozent ?? 0} />
      {job.bytesTotal !== null && job.bytesDone !== null && (
        <div className="fortschritt__bytes">
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
export function Aufbau({
  instanz,
  job,
  logs,
}: {
  instanz: Instance | null;
  job: Job | null;
  logs: LogLine[];
}) {
  const phase = phaseVon(job, instanz);
  const letzte = logs.slice(-8);

  return (
    <div className="aufbau">
      {phase === 'job' && job && <Fortschrittszeile job={job} />}

      {phase === 'start' && (
        <div className="fortschritt">
          <div className="fortschritt__kopf">
            <span className="fortschritt__phase">Server fährt hoch</span>
            <span className="fortschritt__zahl">
              {formatDauer(instanz?.metrics.uptimeSec ?? 0)}
            </span>
          </div>
          {/* Bewusst kein Balken: für diese Phase gibt es keinen Messwert, und
              ein hochlaufender Balken ohne Grundlage wäre eine Behauptung. */}
          <p className="fortschritt__hinweis">
            {instanz?.lastBootSec
              ? `Der Server erzeugt seine Welt. Beim letzten Mal dauerte das ${formatDauer(instanz.lastBootSec)}.`
              : 'Der Server erzeugt seine Welt. Wie lange das dauert, weiß das Panel erst nach dem ersten Start.'}
          </p>
        </div>
      )}

      {phase === 'fertig' && (
        <p className="fortschritt__hinweis fortschritt__hinweis--gut">
          Der Server ist online
          {instanz?.lastBootSec ? ` — Start in ${formatDauer(instanz.lastBootSec)}` : ''}.
        </p>
      )}

      {phase === 'fehler' && (
        <p className="fortschritt__hinweis fortschritt__hinweis--fehler">
          {job?.error ?? instanz?.error ?? 'Der Aufbau ist fehlgeschlagen.'}
        </p>
      )}

      {/* Immer gerendert, auch leer: sonst wächst der Dialog in dem Moment, in
          dem die erste Logzeile eintrifft, und springt unter dem Mauszeiger weg. */}
      <div className="aufbau__log" aria-label="Letzte Logzeilen">
        {letzte.length === 0 ? (
          <span className="aufbau__leer">// noch keine Ausgabe</span>
        ) : (
          letzte.map((zeile, index) => (
            <div className="aufbau__zeile" key={`${zeile.time}-${index}`}>
              <span className="aufbau__zeit">{zeile.time}</span>
              <span className={`aufbau__text aufbau__text--${zeile.level.toLowerCase()}`}>
                {zeile.text}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

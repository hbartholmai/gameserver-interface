import { useRef } from 'react';
import { formatBytes, formatTimestamp, type Instance, type WorldInfo } from '@gsp/shared';
import { Empty, SectionLabel } from '../components/basics.js';

/**
 * Die Spielwelt einer Instanz: herunterladen und austauschen.
 *
 * Abgegrenzt vom Backup-Reiter: der verwaltet panelinterne Sicherungen, die nur
 * an derselben Stelle zurückgespielt werden können. Hier geht es um den Weg
 * nach draußen und wieder herein — eine Welt einem Mitspieler geben, eine von
 * einem alten Server übernehmen, eine aus dem Einzelspieler hochladen.
 */
export function World({
  instance,
  world,
  busy,
  downloadUrl,
  onFile,
}: {
  instance: Instance;
  world: WorldInfo | null;
  busy: boolean;
  downloadUrl: string;
  onFile: (file: File) => void;
}) {
  const picker = useRef<HTMLInputElement>(null);

  if (!world) return <Empty text="Weltdaten werden geladen" />;

  const present = world.parts.filter((t) => t.present);
  const isRunning = instance.status !== 'Offline';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-8)' }}>
      <section className="panel detailhead">
        <div>
          <div className="tile__label">Welt</div>
          <div className="tile__value tile__value--small">{world.name}</div>
          <div className="tile__foot">
            {world.nameField
              ? 'Der Name steht im Config-Reiter und ist nach dem Anlegen fest.'
              : 'Fester Name — dieses Spiel kennt kein Weltnamensfeld.'}
          </div>
        </div>
        <div>
          <div className="tile__label">Größe</div>
          <div className="tile__value tile__value--small">{formatBytes(world.sizeBytes)}</div>
          <div className="tile__foot">
            {world.modifiedAt ? `zuletzt gespeichert ${formatTimestamp(world.modifiedAt)}` : 'noch nie gespeichert'}
          </div>
        </div>

        <div className="detailhead__actions">
          {/*
            Lesen ist harmlos und geht auch, während der Server läuft. Gibt es
            nichts zu laden, steht hier ein echter deaktivierter Knopf: ein
            `<a>` lässt sich nicht deaktivieren, und ein Link ins Leere lieferte
            dem Benutzer eine Fehlermeldung als Dateidownload.
          */}
          {present.length === 0 ? (
            <button type="button" className="button button--secondary" disabled>
              Welt herunterladen
            </button>
          ) : (
            <a className="button button--secondary" href={downloadUrl}>
              Welt herunterladen
            </a>
          )}
          <button
            type="button"
            className="button button--primary"
            disabled={isRunning || busy}
            onClick={() => picker.current?.click()}
          >
            Welt austauschen…
          </button>
        </div>
      </section>

      {isRunning && (
        <p className="hint hint--warn">
          Zum Austauschen muss die Instanz gestoppt sein — ein laufender Server hält seine Welt im
          Speicher und schriebe beim nächsten Speichern darüber.
        </p>
      )}

      <input
        ref={picker}
        type="file"
        accept={world.accept.join(',')}
        style={{ display: 'none' }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Zurücksetzen, damit dieselbe Datei erneut gewählt werden kann.
          event.target.value = '';
          if (file) onFile(file);
        }}
      />

      <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
        <SectionLabel
          text="Bestandteile"
          right={world.raw ? 'Download als einzelne Datei' : 'Download als ZIP'}
        />
        <div className="rows">
          {world.parts.length === 0 && <Empty text="noch keine Weltdaten" />}
          {world.parts.map((teil) => (
            <div className="row" key={teil.name}>
              <span className="row__file">{teil.name}</span>
              <span className="row__meta">{teil.type === 'dir' ? 'Verzeichnis' : 'Datei'}</span>
              {teil.present ? (
                <>
                  <span className="row__size">{formatBytes(teil.sizeBytes)}</span>
                  <span className="row__time">
                    {teil.modifiedAt ? formatTimestamp(teil.modifiedAt) : ''}
                  </span>
                </>
              ) : (
                /* Fehlende Teile werden gezeigt, nicht verschwiegen — sonst
                   wundert sich der Betreiber über die Größe. */
                <span className="row__meta">fehlt</span>
              )}
            </div>
          ))}
        </div>
      </section>

      <p className="hint">
        Der Austausch ersetzt nur die Weltdaten; Serverkonfiguration, Mods und Logs bleiben
        unangetastet. Angenommen werden {world.accept.join(' und ')} bis {formatBytes(world.maxUploadBytes)}.
        {' '}Das Heruntergeladene heißt <strong>{world.downloadName}</strong> und lässt sich unverändert
        wieder einspielen.
      </p>
    </div>
  );
}

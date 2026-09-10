import { useRef } from 'react';
import { formatBytes, formatTimestamp, type Instance, type WorldInfo } from '@gsp/shared';
import { Leerzustand, SektionsLabel } from '../components/basis.js';

/**
 * Die Spielwelt einer Instanz: herunterladen und austauschen.
 *
 * Abgegrenzt vom Backup-Reiter: der verwaltet panelinterne Sicherungen, die nur
 * an derselben Stelle zurückgespielt werden können. Hier geht es um den Weg
 * nach draußen und wieder herein — eine Welt einem Mitspieler geben, eine von
 * einem alten Server übernehmen, eine aus dem Einzelspieler hochladen.
 */
export function Welt({
  instanz,
  welt,
  beschaeftigt,
  downloadUrl,
  onDatei,
}: {
  instanz: Instance;
  welt: WorldInfo | null;
  beschaeftigt: boolean;
  downloadUrl: string;
  onDatei: (datei: File) => void;
}) {
  const auswahl = useRef<HTMLInputElement>(null);

  if (!welt) return <Leerzustand text="Weltdaten werden geladen" />;

  const vorhanden = welt.parts.filter((t) => t.present);
  const laeuft = instanz.status !== 'Offline';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-8)' }}>
      <section className="panel detailkopf">
        <div>
          <div className="kachel__label">Welt</div>
          <div className="kachel__wert kachel__wert--klein">{welt.name}</div>
          <div className="kachel__fuss">
            {welt.nameField
              ? 'Der Name steht im Config-Reiter und ist nach dem Anlegen fest.'
              : 'Fester Name — dieses Spiel kennt kein Weltnamensfeld.'}
          </div>
        </div>
        <div>
          <div className="kachel__label">Größe</div>
          <div className="kachel__wert kachel__wert--klein">{formatBytes(welt.sizeBytes)}</div>
          <div className="kachel__fuss">
            {welt.modifiedAt ? `zuletzt gespeichert ${formatTimestamp(welt.modifiedAt)}` : 'noch nie gespeichert'}
          </div>
        </div>

        <div className="detailkopf__aktionen">
          {/*
            Lesen ist harmlos und geht auch, während der Server läuft. Gibt es
            nichts zu laden, steht hier ein echter deaktivierter Knopf: ein
            `<a>` lässt sich nicht deaktivieren, und ein Link ins Leere lieferte
            dem Benutzer eine Fehlermeldung als Dateidownload.
          */}
          {vorhanden.length === 0 ? (
            <button type="button" className="knopf knopf--sekundaer" disabled>
              Welt herunterladen
            </button>
          ) : (
            <a className="knopf knopf--sekundaer" href={downloadUrl}>
              Welt herunterladen
            </a>
          )}
          <button
            type="button"
            className="knopf knopf--primaer"
            disabled={laeuft || beschaeftigt}
            onClick={() => auswahl.current?.click()}
          >
            Welt austauschen…
          </button>
        </div>
      </section>

      {laeuft && (
        <p className="hinweis hinweis--warnung">
          Zum Austauschen muss die Instanz gestoppt sein — ein laufender Server hält seine Welt im
          Speicher und schriebe beim nächsten Speichern darüber.
        </p>
      )}

      <input
        ref={auswahl}
        type="file"
        accept={welt.accept.join(',')}
        style={{ display: 'none' }}
        onChange={(event) => {
          const datei = event.target.files?.[0];
          // Zurücksetzen, damit dieselbe Datei erneut gewählt werden kann.
          event.target.value = '';
          if (datei) onDatei(datei);
        }}
      />

      <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
        <SektionsLabel
          text="Bestandteile"
          rechts={welt.raw ? 'Download als einzelne Datei' : 'Download als ZIP'}
        />
        <div className="zeilen">
          {welt.parts.length === 0 && <Leerzustand text="noch keine Weltdaten" />}
          {welt.parts.map((teil) => (
            <div className="zeile" key={teil.name}>
              <span className="zeile__datei">{teil.name}</span>
              <span className="zeile__meta">{teil.type === 'dir' ? 'Verzeichnis' : 'Datei'}</span>
              {teil.present ? (
                <>
                  <span className="zeile__groesse">{formatBytes(teil.sizeBytes)}</span>
                  <span className="zeile__zeit">
                    {teil.modifiedAt ? formatTimestamp(teil.modifiedAt) : ''}
                  </span>
                </>
              ) : (
                /* Fehlende Teile werden gezeigt, nicht verschwiegen — sonst
                   wundert sich der Betreiber über die Größe. */
                <span className="zeile__meta">fehlt</span>
              )}
            </div>
          ))}
        </div>
      </section>

      <p className="hinweis">
        Der Austausch ersetzt nur die Weltdaten; Serverkonfiguration, Mods und Logs bleiben
        unangetastet. Angenommen werden {welt.accept.join(' und ')} bis {formatBytes(welt.maxUploadBytes)}.
        {' '}Das Heruntergeladene heißt <strong>{welt.downloadName}</strong> und lässt sich unverändert
        wieder einspielen.
      </p>
    </div>
  );
}

import { formatBytes, formatTimestamp, type Backup, type Instance } from '@gsp/shared';
import { Leerzustand, SektionsLabel } from '../components/basis.js';

export function Backups({
  instanz,
  backups,
  beschaeftigt,
  onUpdate,
  onErstellen,
  onWiederherstellen,
  onLoeschen,
}: {
  instanz: Instance;
  backups: Backup[];
  beschaeftigt: boolean;
  onUpdate: () => void;
  onErstellen: () => void;
  onWiederherstellen: (backup: Backup) => void;
  onLoeschen: (backup: Backup) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-8)' }}>
      <section className="panel detailkopf">
        <div>
          <div className="kachel__label">Version</div>
          <div className="kachel__wert kachel__wert--klein">{instanz.version}</div>
          <div className={`kachel__fuss${instanz.updateAvailable ? ' kachel__fuss--warnung' : ''}`}>
            {instanz.updateNote}
          </div>
        </div>
        <div className="detailkopf__aktionen">
          <button
            type="button"
            className="knopf knopf--primaer"
            disabled={instanz.updating || beschaeftigt}
            onClick={onUpdate}
          >
            {instanz.updating ? 'Update läuft…' : 'Update installieren'}
          </button>
          <button
            type="button"
            className="knopf knopf--sekundaer"
            disabled={beschaeftigt}
            onClick={onErstellen}
          >
            Backup erstellen
          </button>
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
        <SektionsLabel text="Snapshots" rechts={instanz.backupSchedule} />
        <div className="zeilen">
          {backups.length === 0 && <Leerzustand text="noch keine Snapshots" />}
          {backups.map((backup) => (
            <div className="zeile" key={backup.id}>
              <span className="zeile__datei" title={backup.file}>
                {backup.file}
              </span>
              <span className="zeile__zeit">{formatTimestamp(backup.createdAt)}</span>
              <span className="zeile__groesse">{formatBytes(backup.sizeBytes)}</span>
              <span className={`zeile__art zeile__art--${backup.kind}`}>
                {backup.kind === 'manuell' ? 'Manuell' : 'Auto'}
              </span>
              <button
                type="button"
                className="knopf knopf--klein"
                disabled={beschaeftigt}
                onClick={() => onWiederherstellen(backup)}
              >
                Restore
              </button>
              <button
                type="button"
                className="knopf knopf--klein knopf--klein-gefahr"
                disabled={beschaeftigt}
                onClick={() => onLoeschen(backup)}
              >
                Löschen
              </button>
            </div>
          ))}
        </div>
        <p className="hinweis">
          Eine Wiederherstellung stoppt die Instanz, ersetzt die Weltdaten und startet sie danach wieder.
        </p>
      </section>
    </div>
  );
}

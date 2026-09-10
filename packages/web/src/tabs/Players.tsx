import { formatPing, formatPlaytime, pingColor, type Instance } from '@gsp/shared';
import { Empty, SectionLabel } from '../components/basics.js';

export function Players({
  instance,
  template,
  onKick,
  onBann,
  onAufheben,
}: {
  instance: Instance;
  /** Beschriftung der Vorlage. Früher stand hier ein fester Spielname im Text. */
  template: string;
  onKick: (name: string) => void;
  onBann: (name: string) => void;
  onAufheben: (name: string) => void;
}) {
  const moderierbar = instance.capabilities.moderation;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-8)' }}>
      <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
        <SectionLabel text="Verbundene Spieler" right={instance.players.length} />
        <div className="rows">
          {instance.players.length === 0 && <Empty text="niemand verbunden" />}
          {instance.players.map((spieler) => (
            <div className="row" key={spieler.name}>
              <span className="row__name">{spieler.name}</span>
              <span className="row__meta">{formatPlaytime(spieler.playtimeSec)}</span>
              <span className="row__ping" style={{ color: pingColor(spieler.pingMs) }}>
                {formatPing(spieler.pingMs)}
              </span>
              {moderierbar && (
                <>
                  <button
                    type="button"
                    className="button button--small button--small-warn"
                    onClick={() => onKick(spieler.name)}
                  >
                    Kick
                  </button>
                  <button
                    type="button"
                    className="button button--small button--small-danger"
                    onClick={() => onBann(spieler.name)}
                  >
                    Bann
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
        {!moderierbar && instance.players.length > 0 && (
          <p className="hint">
            Kick und Bann sind bei {template} nur im Spiel möglich — die Vorlage sagt keine
            serverseitige Moderation zu.
          </p>
        )}
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
        <SectionLabel text="Bannliste" right={instance.bans.length} />
        <div className="rows">
          {instance.bans.length === 0 && <Empty text="keine Sperren" />}
          {instance.bans.map((bann) => (
            <div className="row" key={bann.name}>
              <span className="row__name">{bann.name}</span>
              <span className="row__meta">{bann.reason}</span>
              <button
                type="button"
                className="button button--small"
                onClick={() => onAufheben(bann.name)}
              >
                Aufheben
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

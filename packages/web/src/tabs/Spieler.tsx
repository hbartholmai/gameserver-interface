import { formatPing, formatPlaytime, pingColor, type Instance } from '@gsp/shared';
import { Leerzustand, SektionsLabel } from '../components/basis.js';

export function Spieler({
  instanz,
  vorlage,
  onKick,
  onBann,
  onAufheben,
}: {
  instanz: Instance;
  /** Beschriftung der Vorlage. Früher stand hier ein fester Spielname im Text. */
  vorlage: string;
  onKick: (name: string) => void;
  onBann: (name: string) => void;
  onAufheben: (name: string) => void;
}) {
  const moderierbar = instanz.capabilities.moderation;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-8)' }}>
      <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
        <SektionsLabel text="Verbundene Spieler" rechts={instanz.players.length} />
        <div className="zeilen">
          {instanz.players.length === 0 && <Leerzustand text="niemand verbunden" />}
          {instanz.players.map((spieler) => (
            <div className="zeile" key={spieler.name}>
              <span className="zeile__name">{spieler.name}</span>
              <span className="zeile__meta">{formatPlaytime(spieler.playtimeSec)}</span>
              <span className="zeile__ping" style={{ color: pingColor(spieler.pingMs) }}>
                {formatPing(spieler.pingMs)}
              </span>
              {moderierbar && (
                <>
                  <button
                    type="button"
                    className="knopf knopf--klein knopf--klein-warn"
                    onClick={() => onKick(spieler.name)}
                  >
                    Kick
                  </button>
                  <button
                    type="button"
                    className="knopf knopf--klein knopf--klein-gefahr"
                    onClick={() => onBann(spieler.name)}
                  >
                    Bann
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
        {!moderierbar && instanz.players.length > 0 && (
          <p className="hinweis">
            Kick und Bann sind bei {vorlage} nur im Spiel möglich — die Vorlage sagt keine
            serverseitige Moderation zu.
          </p>
        )}
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
        <SektionsLabel text="Bannliste" rechts={instanz.bans.length} />
        <div className="zeilen">
          {instanz.bans.length === 0 && <Leerzustand text="keine Sperren" />}
          {instanz.bans.map((bann) => (
            <div className="zeile" key={bann.name}>
              <span className="zeile__name">{bann.name}</span>
              <span className="zeile__meta">{bann.reason}</span>
              <button
                type="button"
                className="knopf knopf--klein"
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

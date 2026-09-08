import { useEffect, useRef, useState } from 'react';
import type { Instance, LogLine, LogLevel } from '@gsp/shared';
import { SektionsLabel } from '../components/basis.js';

type Filter = 'Alle' | 'Info' | 'Warn';

const FILTER: Filter[] = ['Alle', 'Info', 'Warn'];

export function Konsole({
  instanz,
  zeilen,
  onBefehl,
}: {
  instanz: Instance;
  zeilen: LogLine[];
  onBefehl: (befehl: string) => Promise<void>;
}) {
  const [filter, setFilter] = useState<Filter>('Alle');
  const [befehl, setBefehl] = useState('');
  const [sendet, setSendet] = useState(false);
  const fenster = useRef<HTMLDivElement>(null);

  const schreibbar = instanz.capabilities.console === 'rcon';
  const sichtbar = zeilen.filter((zeile) => passt(zeile.level, filter));

  // Ans Ende scrollen, solange der Nutzer nicht selbst nach oben gescrollt hat.
  const amEnde = useRef(true);
  useEffect(() => {
    const el = fenster.current;
    if (el && amEnde.current) el.scrollTop = el.scrollHeight;
  }, [sichtbar.length]);

  const absenden = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = befehl.trim();
    if (!text || sendet) return;
    setSendet(true);
    try {
      await onBefehl(text);
      setBefehl('');
    } finally {
      setSendet(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-5)' }}>
      <div className="konsole__kopf">
        <SektionsLabel text={`Live-Konsole · ${instanz.name}`} />
        <div className="chips" role="group" aria-label="Logfilter">
          {FILTER.map((option) => (
            <button
              key={option}
              type="button"
              className={`chip${filter === option ? ' chip--aktiv' : ''}`}
              aria-pressed={filter === option}
              onClick={() => setFilter(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div
        className="logfenster"
        ref={fenster}
        role="log"
        aria-live="polite"
        onScroll={(event) => {
          const el = event.currentTarget;
          amEnde.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {sichtbar.length === 0 && <p className="leerzustand">// keine Logzeilen</p>}
        {sichtbar.map((zeile, index) => (
          <div className="logzeile" key={`${zeile.time}-${index}`}>
            <span className="logzeile__zeit">{zeile.time}</span>
            <span className={`logzeile__level logzeile__level--${zeile.level}`}>{zeile.level}</span>
            <span className={`logzeile__text${zeile.level === 'ERROR' ? ' logzeile__text--ERROR' : ''}`}>
              {zeile.text}
            </span>
          </div>
        ))}
      </div>

      <form className="eingabezeile" onSubmit={(e) => void absenden(e)}>
        <span className="eingabezeile__pfeil" aria-hidden="true">
          &gt;
        </span>
        <input
          value={befehl}
          onChange={(e) => setBefehl(e.target.value)}
          disabled={!schreibbar || sendet}
          placeholder={
            schreibbar ? 'Befehl eingeben, z. B. save-all' : 'Diese Vorlage nimmt keine Befehle entgegen'
          }
          aria-label="Konsolenbefehl"
        />
        <button type="submit" className="knopf knopf--primaer" disabled={!schreibbar || sendet}>
          Senden
        </button>
      </form>

      {!schreibbar && (
        <p className="hinweis">
          {instanz.game === 'valheim'
            ? 'Valheim bietet kein RCON — Admin-Befehle gibt es nur in der Spielkonsole (F5).'
            : 'Enshrouded bietet keine Serverkonsole — Verwaltung erfolgt im Spiel über eine Admin-Rolle.'}
        </p>
      )}
    </div>
  );
}

function passt(level: LogLevel, filter: Filter): boolean {
  if (filter === 'Alle') return true;
  if (filter === 'Info') return level === 'INFO' || level === 'CMD';
  // `Warn` zeigt auch Fehler — sie sind das, wonach man in dem Filter sucht.
  return level === 'WARN' || level === 'ERROR';
}

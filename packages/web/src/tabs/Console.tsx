import { useEffect, useRef, useState } from 'react';
import type { Instance, LogLine, LogLevel } from '@gsp/shared';
import { SectionLabel } from '../components/basics.js';

type Filter = 'Alle' | 'Info' | 'Warn';

const FILTER: Filter[] = ['Alle', 'Info', 'Warn'];

export function Console({
  instance,
  template,
  lines,
  onBefehl,
}: {
  instance: Instance;
  /** Beschriftung der Vorlage. Früher stand hier ein fester Spielname im Text. */
  template: string;
  lines: LogLine[];
  onBefehl: (befehl: string) => Promise<void>;
}) {
  const [filter, setFilter] = useState<Filter>('Alle');
  const [befehl, setBefehl] = useState('');
  const [sendet, setSendet] = useState(false);
  const fenster = useRef<HTMLDivElement>(null);

  const schreibbar = instance.capabilities.console === 'rcon';
  const sichtbar = lines.filter((line) => passt(line.level, filter));

  // Ans Ende scrollen, solange der Nutzer nicht selbst nach oben gescrollt hat.
  const amEnde = useRef(true);
  useEffect(() => {
    const el = fenster.current;
    if (el && amEnde.current) el.scrollTop = el.scrollHeight;
  }, [sichtbar.length]);

  const submit = async (event: React.FormEvent) => {
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
      <div className="console__head">
        <SectionLabel text={`Live-Konsole · ${instance.name}`} />
        <div className="chips" role="group" aria-label="Logfilter">
          {FILTER.map((option) => (
            <button
              key={option}
              type="button"
              className={`chip${filter === option ? ' chip--active' : ''}`}
              aria-pressed={filter === option}
              onClick={() => setFilter(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div
        className="logview"
        ref={fenster}
        role="log"
        aria-live="polite"
        onScroll={(event) => {
          const el = event.currentTarget;
          amEnde.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {sichtbar.length === 0 && <p className="empty">// keine Logzeilen</p>}
        {sichtbar.map((line, index) => (
          <div className="logline" key={`${line.time}-${index}`}>
            <span className="logline__time">{line.time}</span>
            <span className={`logline__level logline__level--${line.level}`}>{line.level}</span>
            <span className={`logline__text${line.level === 'ERROR' ? ' logline__text--ERROR' : ''}`}>
              {line.text}
            </span>
          </div>
        ))}
      </div>

      <form className="inputline" onSubmit={(e) => void submit(e)}>
        <span className="inputline__arrow" aria-hidden="true">
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
        <button type="submit" className="button button--primary" disabled={!schreibbar || sendet}>
          Senden
        </button>
      </form>

      {!schreibbar && (
        <p className="hint">
          {template} nimmt keine Befehle über den Server entgegen; die Konsole zeigt nur den
          Log-Strom. Warum, steht in den Hinweisen der Vorlage.
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

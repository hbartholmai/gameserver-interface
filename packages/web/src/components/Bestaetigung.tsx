import { useCallback, useState, type ReactNode } from 'react';

/**
 * Eine Rückfrage vor einer Aktion, die nicht folgenlos ist. Ersetzt
 * `window.confirm`: der Browserdialog fällt aus dem Design, hat „OK" als
 * Vorgabe und lässt sich mit der Eingabetaste wegdrücken.
 */
export type Frage = {
  titel: string;
  text: string;
  /** Beschriftung des bestätigenden Knopfes, z. B. „Stoppen". */
  knopf: string;
  /** Roter Knopf statt Akzentfarbe. */
  gefahr?: boolean;
  /** Muss wörtlich eingegeben werden, bevor der Knopf freigibt. */
  tippen?: string;
  onJa: () => void;
};

/**
 * Liefert die Funktion zum Stellen der Frage und den Dialog zum Einhängen.
 * Der Aufruf bleibt damit so kurz wie das bisherige `if (confirm(...))`.
 */
export function useBestaetigung(): { frage: (f: Frage) => void; dialog: ReactNode } {
  const [offen, setOffen] = useState<Frage | null>(null);
  const [eingabe, setEingabe] = useState('');

  const frage = useCallback((f: Frage) => {
    // Der getippte Text gehört zur einzelnen Frage, nicht zum Dialog.
    setEingabe('');
    setOffen(f);
  }, []);

  const dialog = offen ? (
    <Dialog
      frage={offen}
      eingabe={eingabe}
      onEingabe={setEingabe}
      onSchliessen={() => setOffen(null)}
      onJa={() => {
        setOffen(null);
        offen.onJa();
      }}
    />
  ) : null;

  return { frage, dialog };
}

function Dialog({
  frage,
  eingabe,
  onEingabe,
  onSchliessen,
  onJa,
}: {
  frage: Frage;
  eingabe: string;
  onEingabe: (wert: string) => void;
  onSchliessen: () => void;
  onJa: () => void;
}) {
  // Groß-/Kleinschreibung zählt nicht: wer „Löschen" tippt, meint dasselbe.
  const freigegeben =
    frage.tippen === undefined ||
    eingabe.trim().toLocaleLowerCase('de') === frage.tippen.toLocaleLowerCase('de');

  return (
    <div
      className="dialog-hintergrund"
      role="dialog"
      aria-modal="true"
      aria-label={frage.titel}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onSchliessen();
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onSchliessen();
      }}
    >
      <div className="dialog dialog--schmal">
        <div className="dialog__kopf">
          <h2 className="dialog__titel">{frage.titel}</h2>
          <button type="button" className="knopf knopf--klein" onClick={onSchliessen}>
            Schließen
          </button>
        </div>

        <div className="dialog__koerper bestaetigung">
          <p className="bestaetigung__text">{frage.text}</p>

          {frage.tippen !== undefined && (
            <div className="feld">
              <label className="feld__label" htmlFor="bestaetigung-tippen">
                Zum Bestätigen <strong>{frage.tippen}</strong> eingeben
              </label>
              <div className="feld__eingabe">
                <input
                  id="bestaetigung-tippen"
                  type="text"
                  value={eingabe}
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => onEingabe(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && freigegeben) onJa();
                  }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="dialog__fuss">
          {/* Ohne Tippfeld liegt der Fokus auf „Abbrechen“: die harmlose Wahl,
              und erst dadurch greift Escape — der Tastendruck wird am
              Hintergrund abgefangen und braucht ein fokussiertes Kind. */}
          <button
            type="button"
            className="knopf knopf--sekundaer"
            autoFocus={frage.tippen === undefined}
            onClick={onSchliessen}
          >
            Abbrechen
          </button>
          <button
            type="button"
            className={`knopf ${frage.gefahr ? 'knopf--gefahr' : 'knopf--primaer'}`}
            disabled={!freigegeben}
            onClick={onJa}
          >
            {frage.knopf}
          </button>
        </div>
      </div>
    </div>
  );
}

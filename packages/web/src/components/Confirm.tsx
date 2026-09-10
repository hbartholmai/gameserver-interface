import { useCallback, useState, type ReactNode } from 'react';

/**
 * Eine Rückfrage vor einer Aktion, die nicht folgenlos ist. Ersetzt
 * `window.confirm`: der Browserdialog fällt aus dem Design, hat „OK" als
 * Vorgabe und lässt sich mit der Eingabetaste wegdrücken.
 */
export type Question = {
  title: string;
  text: string;
  /** Beschriftung des bestätigenden Knopfes, z. B. „Stoppen". */
  button: string;
  /** Roter Knopf statt Akzentfarbe. */
  danger?: boolean;
  /** Muss wörtlich eingegeben werden, bevor der Knopf freigibt. */
  typeWord?: string;
  /**
   * Eine abwählbare Vorgabe, die zur Frage gehört — „Vorher sichern“ etwa.
   * Den Zustand hält der Aufrufer, damit der Dialog zustandslos bleibt.
   */
  toggle?: {
    label: string;
    help?: string;
    value: boolean;
    onChange: (value: boolean) => void;
  };
  onJa: () => void;
};

/**
 * Liefert die Funktion zum Stellen der Frage und den Dialog zum Einhängen.
 * Der Aufruf bleibt damit so kurz wie das bisherige `if (confirm(...))`.
 */
export function useConfirm(): { ask: (f: Question) => void; dialog: ReactNode } {
  const [open, setOpen] = useState<Question | null>(null);
  const [input, setEingabe] = useState('');

  const ask = useCallback((f: Question) => {
    // Der getippte Text gehört zur einzelnen Frage, nicht zum Dialog.
    setEingabe('');
    setOpen(f);
  }, []);

  const dialog = open ? (
    <Dialog
      ask={open}
      input={input}
      onEingabe={setEingabe}
      onClose={() => setOpen(null)}
      onJa={() => {
        setOpen(null);
        open.onJa();
      }}
    />
  ) : null;

  return { ask, dialog };
}

function Dialog({
  ask,
  input,
  onEingabe,
  onClose,
  onJa,
}: {
  ask: Question;
  input: string;
  onEingabe: (value: string) => void;
  onClose: () => void;
  onJa: () => void;
}) {
  // Groß-/Kleinschreibung zählt nicht: wer „Löschen" tippt, meint dasselbe.
  const enabled =
    ask.typeWord === undefined ||
    input.trim().toLocaleLowerCase('de') === ask.typeWord.toLocaleLowerCase('de');

  return (
    <div
      className="dialog-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={ask.title}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog dialog--narrow">
        <div className="dialog__head">
          <h2 className="dialog__title">{ask.title}</h2>
          <button type="button" className="button button--small" onClick={onClose}>
            Schließen
          </button>
        </div>

        <div className="dialog__body confirm">
          <p className="confirm__text">{ask.text}</p>

          {/* Dieselbe Machart wie im Vorlageneditor: ein ja/nein-Knopf statt
              einer Checkbox. Die native Checkbox wäre das einzige Element der
              Oberfläche, das die Farben des Browsers statt der eigenen trägt. */}
          {ask.toggle && (
            <div className="field">
              <label className="field__label">{ask.toggle.label}</label>
              <div className="field__input">
                <div className="field__toggle">
                  <button
                    type="button"
                    className={`button button--small${ask.toggle.value ? ' chip--active' : ''}`}
                    aria-pressed={ask.toggle.value}
                    onClick={() => ask.toggle?.onChange(!ask.toggle.value)}
                  >
                    {ask.toggle.value ? 'ja' : 'nein'}
                  </button>
                </div>
                {ask.toggle.help && <span className="field__help">{ask.toggle.help}</span>}
              </div>
            </div>
          )}

          {ask.typeWord !== undefined && (
            <div className="field">
              <label className="field__label" htmlFor="bestaetigung-tippen">
                Zum Bestätigen <strong>{ask.typeWord}</strong> eingeben
              </label>
              <div className="field__input">
                <input
                  id="bestaetigung-tippen"
                  type="text"
                  value={input}
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => onEingabe(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && enabled) onJa();
                  }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="dialog__foot">
          {/* Ohne Tippfeld liegt der Fokus auf „Abbrechen“: die harmlose Wahl,
              und erst dadurch greift Escape — der Tastendruck wird am
              Hintergrund abgefangen und braucht ein fokussiertes Kind. */}
          <button
            type="button"
            className="button button--secondary"
            autoFocus={ask.typeWord === undefined}
            onClick={onClose}
          >
            Abbrechen
          </button>
          <button
            type="button"
            className={`button ${ask.danger ? 'button--danger' : 'button--primary'}`}
            disabled={!enabled}
            onClick={onJa}
          >
            {ask.button}
          </button>
        </div>
      </div>
    </div>
  );
}

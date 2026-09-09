import type { FieldSpec } from '@gsp/shared';

export type Wert = string | number | boolean;

/**
 * Ein Formularfeld aus der Vorlagenbeschreibung. Wizard und Config-Reiter
 * teilen sich diese Darstellung, damit beide Ansichten identisch aussehen.
 */
export function Feld({
  spec,
  wert,
  fehler,
  gesperrt,
  onAendern,
}: {
  spec: FieldSpec;
  wert: Wert;
  fehler?: string;
  gesperrt?: boolean;
  onAendern: (wert: Wert) => void;
}) {
  const id = `feld-${spec.id}`;
  const hilfeId = spec.help ? `${id}-hilfe` : undefined;
  const fehlerId = fehler ? `${id}-fehler` : undefined;
  const beschriftungen = [hilfeId, fehlerId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="feld">
      <label className="feld__label" htmlFor={id}>
        {spec.label}
        {spec.required && <span aria-hidden="true"> *</span>}
      </label>

      <div className="feld__eingabe">
        {spec.type === 'boolean' ? (
          <div className="feld__schalter">
            <button
              type="button"
              id={id}
              className={`knopf knopf--klein${wert === true ? ' chip--aktiv' : ''}`}
              aria-pressed={wert === true}
              disabled={gesperrt}
              onClick={() => onAendern(!wert)}
            >
              {wert ? 'aktiv' : 'inaktiv'}
            </button>
          </div>
        ) : spec.type === 'select' ? (
          <select
            id={id}
            value={String(wert)}
            disabled={gesperrt}
            aria-describedby={beschriftungen}
            onChange={(event) => onAendern(event.target.value)}
          >
            {(spec.options ?? []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={id}
            type={spec.type === 'password' ? 'password' : spec.type === 'number' ? 'number' : 'text'}
            value={String(wert)}
            disabled={gesperrt}
            min={spec.min}
            max={spec.max}
            maxLength={spec.maxLength}
            placeholder={spec.placeholder}
            aria-describedby={beschriftungen}
            aria-invalid={fehler ? true : undefined}
            onChange={(event) =>
              onAendern(spec.type === 'number' ? Number(event.target.value) : event.target.value)
            }
          />
        )}

        {spec.help && (
          <span className="feld__hilfe" id={hilfeId}>
            {spec.help}
          </span>
        )}
        {fehler && (
          <span className="feld__fehler" id={fehlerId}>
            {fehler}
          </span>
        )}
      </div>
    </div>
  );
}

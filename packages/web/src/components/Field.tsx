import type { FieldSpec } from '@gsp/shared';

export type Wert = string | number | boolean;

/**
 * Ein Formularfeld aus der Vorlagenbeschreibung. Wizard und Config-Reiter
 * teilen sich diese Darstellung, damit beide Ansichten identisch aussehen.
 */
export function Field({
  spec,
  value,
  errors,
  gesperrt,
  onChange,
}: {
  spec: FieldSpec;
  value: Wert;
  errors?: string;
  gesperrt?: boolean;
  onChange: (value: Wert) => void;
}) {
  const id = `feld-${spec.id}`;
  const hilfeId = spec.help ? `${id}-hilfe` : undefined;
  const fehlerId = errors ? `${id}-fehler` : undefined;
  const beschriftungen = [hilfeId, fehlerId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {spec.label}
        {spec.required && <span aria-hidden="true"> *</span>}
      </label>

      <div className="field__input">
        {spec.type === 'boolean' ? (
          <div className="field__toggle">
            <button
              type="button"
              id={id}
              className={`button button--small${value === true ? ' chip--active' : ''}`}
              aria-pressed={value === true}
              disabled={gesperrt}
              onClick={() => onChange(!value)}
            >
              {value ? 'aktiv' : 'inaktiv'}
            </button>
          </div>
        ) : spec.type === 'select' ? (
          <select
            id={id}
            value={String(value)}
            disabled={gesperrt}
            aria-describedby={beschriftungen}
            onChange={(event) => onChange(event.target.value)}
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
            value={String(value)}
            disabled={gesperrt}
            min={spec.min}
            max={spec.max}
            maxLength={spec.maxLength}
            placeholder={spec.placeholder}
            aria-describedby={beschriftungen}
            aria-invalid={errors ? true : undefined}
            onChange={(event) =>
              onChange(spec.type === 'number' ? Number(event.target.value) : event.target.value)
            }
          />
        )}

        {spec.help && (
          <span className="field__help" id={hilfeId}>
            {spec.help}
          </span>
        )}
        {errors && (
          <span className="field__error" id={fehlerId}>
            {errors}
          </span>
        )}
      </div>
    </div>
  );
}

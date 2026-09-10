import { useState, type ReactNode } from 'react';

/**
 * Bausteine des Vorlagen-Editors. Sie sind bewusst schmal gehalten und nutzen
 * dieselben Klassen wie der Config-Reiter (`.field`, `.row`), damit der Editor
 * kein zweites Formularsystem aufmacht.
 */

/**
 * Ein aufklappbarer Abschnitt. Der Editor zeigt sonst alles gleichzeitig — bei
 * einer Vorlage wie Valheim sind das über zehntausend Pixel, in denen man den
 * gesuchten Wert nicht findet. Offen ist, woran man üblicherweise arbeitet.
 */
export function Section({
  title,
  count,
  openInitially = false,
  hint,
  children,
}: {
  title: string;
  count?: number;
  openInitially?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(openInitially);
  return (
    <section className="section">
      <button
        type="button"
        className="section__head"
        aria-expanded={open}
        onClick={() => setOpen((alt) => !alt)}
      >
        <span className="section__arrow" aria-hidden="true">
          {open ? '−' : '+'}
        </span>
        <span className="section__title">// {title}</span>
        {count !== undefined && <span className="section__count">{count}</span>}
      </button>
      {open && (
        <div className="section__body">
          {hint && <p className="hint">{hint}</p>}
          {children}
        </div>
      )}
    </section>
  );
}

export function TextField({
  label,
  value,
  help,
  singleLine = true,
  gesperrt,
  onChange,
}: {
  label: string;
  value: string;
  help?: string;
  singleLine?: boolean;
  gesperrt?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="field">
      <label className="field__label">{label}</label>
      <div className="field__input">
        {singleLine ? (
          <input value={value} disabled={gesperrt} onChange={(e) => onChange(e.target.value)} />
        ) : (
          <textarea rows={3} value={value} disabled={gesperrt} onChange={(e) => onChange(e.target.value)} />
        )}
        {help && <span className="field__help">{help}</span>}
      </div>
    </div>
  );
}

export function NumberField({
  label,
  value,
  help,
  onChange,
}: {
  label: string;
  value: number;
  help?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="field">
      <label className="field__label">{label}</label>
      <div className="field__input">
        <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} />
        {help && <span className="field__help">{help}</span>}
      </div>
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  help,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  help?: string;
  onChange: (value: T) => void;
}) {
  return (
    <div className="field">
      <label className="field__label">{label}</label>
      <div className="field__input">
        <select value={value} onChange={(e) => onChange(e.target.value as T)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {help && <span className="field__help">{help}</span>}
      </div>
    </div>
  );
}

export function Toggle({
  label,
  value,
  help,
  onChange,
}: {
  label: string;
  value: boolean;
  help?: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="field">
      <label className="field__label">{label}</label>
      <div className="field__input">
        <div className="field__toggle">
          <button
            type="button"
            className={`button button--small${value ? ' chip--active' : ''}`}
            aria-pressed={value}
            onClick={() => onChange(!value)}
          >
            {value ? 'ja' : 'nein'}
          </button>
        </div>
        {help && <span className="field__help">{help}</span>}
      </div>
    </div>
  );
}

/**
 * Eine bearbeitbare Liste: Einträge lassen sich hinzufügen, entfernen und
 * verschieben. Die Reihenfolge zählt — bei Feldern bestimmt sie das Formular,
 * bei Ports die Anzeige.
 */
export function Liste<T>({
  entries,
  emptyText,
  neu,
  onChange,
  render,
}: {
  entries: T[];
  emptyText: string;
  neu: () => T;
  onChange: (entries: T[]) => void;
  render: (entry: T, change: (entry: T) => void, index: number) => ReactNode;
}) {
  const replaceAt = (index: number, value: T) =>
    onChange(entries.map((alt, i) => (i === index ? value : alt)));
  const removeAt = (index: number) => onChange(entries.filter((_, i) => i !== index));
  const moveBy = (index: number, richtung: -1 | 1) => {
    const targetIndex = index + richtung;
    if (targetIndex < 0 || targetIndex >= entries.length) return;
    const copy = [...entries];
    const [out] = copy.splice(index, 1);
    if (out !== undefined) copy.splice(targetIndex, 0, out);
    onChange(copy);
  };

  return (
    <div className="editorlist">
      {entries.length === 0 && <p className="empty">// {emptyText}</p>}

      {entries.map((entry, index) => (
        <div className="editorcard" key={index}>
          <div className="editorcard__head">
            <span className="editorcard__number">{String(index + 1).padStart(2, '0')}</span>
            <div className="editorcard__actions">
              <button
                type="button"
                className="button button--small"
                disabled={index === 0}
                aria-label="nach oben"
                onClick={() => moveBy(index, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="button button--small"
                disabled={index === entries.length - 1}
                aria-label="nach unten"
                onClick={() => moveBy(index, 1)}
              >
                ↓
              </button>
              <button type="button" className="button button--small" onClick={() => removeAt(index)}>
                Entfernen
              </button>
            </div>
          </div>
          {render(entry, (value) => replaceAt(index, value), index)}
        </div>
      ))}

      <button type="button" className="button button--dashed" onClick={() => onChange([...entries, neu()])}>
        + hinzufügen
      </button>
    </div>
  );
}

import { useState, type ReactNode } from 'react';

/**
 * Bausteine des Vorlagen-Editors. Sie sind bewusst schmal gehalten und nutzen
 * dieselben Klassen wie der Config-Reiter (`.feld`, `.zeile`), damit der Editor
 * kein zweites Formularsystem aufmacht.
 */

/**
 * Ein aufklappbarer Abschnitt. Der Editor zeigt sonst alles gleichzeitig — bei
 * einer Vorlage wie Valheim sind das über zehntausend Pixel, in denen man den
 * gesuchten Wert nicht findet. Offen ist, woran man üblicherweise arbeitet.
 */
export function Abschnitt({
  titel,
  anzahl,
  offenAnfangs = false,
  hinweis,
  children,
}: {
  titel: string;
  anzahl?: number;
  offenAnfangs?: boolean;
  hinweis?: string;
  children: ReactNode;
}) {
  const [offen, setOffen] = useState(offenAnfangs);
  return (
    <section className="abschnitt">
      <button
        type="button"
        className="abschnitt__kopf"
        aria-expanded={offen}
        onClick={() => setOffen((alt) => !alt)}
      >
        <span className="abschnitt__pfeil" aria-hidden="true">
          {offen ? '−' : '+'}
        </span>
        <span className="abschnitt__titel">// {titel}</span>
        {anzahl !== undefined && <span className="abschnitt__zahl">{anzahl}</span>}
      </button>
      {offen && (
        <div className="abschnitt__inhalt">
          {hinweis && <p className="hinweis">{hinweis}</p>}
          {children}
        </div>
      )}
    </section>
  );
}

export function TextFeld({
  label,
  wert,
  hilfe,
  einzeilig = true,
  gesperrt,
  onAendern,
}: {
  label: string;
  wert: string;
  hilfe?: string;
  einzeilig?: boolean;
  gesperrt?: boolean;
  onAendern: (wert: string) => void;
}) {
  return (
    <div className="feld">
      <label className="feld__label">{label}</label>
      <div className="feld__eingabe">
        {einzeilig ? (
          <input value={wert} disabled={gesperrt} onChange={(e) => onAendern(e.target.value)} />
        ) : (
          <textarea rows={3} value={wert} disabled={gesperrt} onChange={(e) => onAendern(e.target.value)} />
        )}
        {hilfe && <span className="feld__hilfe">{hilfe}</span>}
      </div>
    </div>
  );
}

export function ZahlFeld({
  label,
  wert,
  hilfe,
  onAendern,
}: {
  label: string;
  wert: number;
  hilfe?: string;
  onAendern: (wert: number) => void;
}) {
  return (
    <div className="feld">
      <label className="feld__label">{label}</label>
      <div className="feld__eingabe">
        <input type="number" value={wert} onChange={(e) => onAendern(Number(e.target.value))} />
        {hilfe && <span className="feld__hilfe">{hilfe}</span>}
      </div>
    </div>
  );
}

export function WahlFeld<T extends string>({
  label,
  wert,
  optionen,
  hilfe,
  onAendern,
}: {
  label: string;
  wert: T;
  optionen: { value: T; label: string }[];
  hilfe?: string;
  onAendern: (wert: T) => void;
}) {
  return (
    <div className="feld">
      <label className="feld__label">{label}</label>
      <div className="feld__eingabe">
        <select value={wert} onChange={(e) => onAendern(e.target.value as T)}>
          {optionen.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {hilfe && <span className="feld__hilfe">{hilfe}</span>}
      </div>
    </div>
  );
}

export function Schalter({
  label,
  wert,
  hilfe,
  onAendern,
}: {
  label: string;
  wert: boolean;
  hilfe?: string;
  onAendern: (wert: boolean) => void;
}) {
  return (
    <div className="feld">
      <label className="feld__label">{label}</label>
      <div className="feld__eingabe">
        <div className="feld__schalter">
          <button
            type="button"
            className={`knopf knopf--klein${wert ? ' chip--aktiv' : ''}`}
            aria-pressed={wert}
            onClick={() => onAendern(!wert)}
          >
            {wert ? 'ja' : 'nein'}
          </button>
        </div>
        {hilfe && <span className="feld__hilfe">{hilfe}</span>}
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
  eintraege,
  leerText,
  neu,
  onAendern,
  zeichne,
}: {
  eintraege: T[];
  leerText: string;
  neu: () => T;
  onAendern: (eintraege: T[]) => void;
  zeichne: (eintrag: T, aendern: (eintrag: T) => void, index: number) => ReactNode;
}) {
  const ersetze = (index: number, wert: T) =>
    onAendern(eintraege.map((alt, i) => (i === index ? wert : alt)));
  const entferne = (index: number) => onAendern(eintraege.filter((_, i) => i !== index));
  const schiebe = (index: number, richtung: -1 | 1) => {
    const ziel = index + richtung;
    if (ziel < 0 || ziel >= eintraege.length) return;
    const kopie = [...eintraege];
    const [raus] = kopie.splice(index, 1);
    if (raus !== undefined) kopie.splice(ziel, 0, raus);
    onAendern(kopie);
  };

  return (
    <div className="editorliste">
      {eintraege.length === 0 && <p className="leerzustand">// {leerText}</p>}

      {eintraege.map((eintrag, index) => (
        <div className="editorkarte" key={index}>
          <div className="editorkarte__kopf">
            <span className="editorkarte__nummer">{String(index + 1).padStart(2, '0')}</span>
            <div className="editorkarte__aktionen">
              <button
                type="button"
                className="knopf knopf--klein"
                disabled={index === 0}
                aria-label="nach oben"
                onClick={() => schiebe(index, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="knopf knopf--klein"
                disabled={index === eintraege.length - 1}
                aria-label="nach unten"
                onClick={() => schiebe(index, 1)}
              >
                ↓
              </button>
              <button type="button" className="knopf knopf--klein" onClick={() => entferne(index)}>
                entfernen
              </button>
            </div>
          </div>
          {zeichne(eintrag, (wert) => ersetze(index, wert), index)}
        </div>
      ))}

      <button type="button" className="knopf knopf--gestrichelt" onClick={() => onAendern([...eintraege, neu()])}>
        + hinzufügen
      </button>
    </div>
  );
}

import { useEffect, useState } from 'react';
import type { Instance, TemplateDescriptor } from '@gsp/shared';
import { Feld, type Wert } from '../components/Feld.js';
import { SektionsLabel } from '../components/basis.js';

export function Config({
  instanz,
  vorlage,
  notiz,
  beschaeftigt,
  onSpeichern,
}: {
  instanz: Instance;
  vorlage: TemplateDescriptor;
  notiz: string;
  beschaeftigt: boolean;
  onSpeichern: (werte: Record<string, Wert>, neustart: boolean) => void;
}) {
  const [werte, setWerte] = useState<Record<string, Wert>>(instanz.settings);
  const [fehler, setFehler] = useState<Record<string, string>>({});

  // Wechselt die Instanz, muss das Formular die Werte der neuen übernehmen.
  useEffect(() => {
    setWerte(instanz.settings);
    setFehler({});
  }, [instanz.id, instanz.settings]);

  const editierbar = vorlage.fields.filter((feld) => feld.editable);

  const absenden = (neustart: boolean) => {
    const offen: Record<string, string> = {};
    for (const feld of editierbar) {
      const wert = werte[feld.id];
      if (feld.required && (wert === '' || wert === undefined)) {
        offen[feld.id] = `${feld.label} ist erforderlich`;
      }
    }
    setFehler(offen);
    if (Object.keys(offen).length > 0) return;

    // Unveränderte Geheimnisse werden nicht mitgeschickt — sonst würde die
    // Maskierung „********“ als neues Passwort gespeichert.
    const nutzlast: Record<string, Wert> = {};
    for (const feld of editierbar) {
      const wert = werte[feld.id];
      if (wert === undefined) continue;
      if (feld.secret && wert === instanz.settings[feld.id]) continue;
      nutzlast[feld.id] = wert;
    }
    onSpeichern(nutzlast, neustart);
  };

  return (
    <div className="config">
      <SektionsLabel text="Serverkonfiguration" />

      {editierbar.map((feld) => (
        <Feld
          key={feld.id}
          spec={feld}
          wert={werte[feld.id] ?? ''}
          fehler={fehler[feld.id]}
          gesperrt={beschaeftigt}
          onAendern={(wert) => setWerte((alt) => ({ ...alt, [feld.id]: wert }))}
        />
      ))}

      <div className="config__fuss">
        <button
          type="button"
          className="knopf knopf--primaer"
          disabled={beschaeftigt}
          onClick={() => absenden(true)}
        >
          Speichern & neu starten
        </button>
        <button
          type="button"
          className="knopf knopf--sekundaer"
          disabled={beschaeftigt}
          onClick={() => absenden(false)}
        >
          Nur speichern
        </button>
        {notiz && <span className="config__notiz">{notiz}</span>}
      </div>

      <p className="hinweis">
        Die Umgebung eines Containers lässt sich nicht nachträglich ändern. „Speichern & neu starten“
        erzeugt den Container neu — die Weltdaten bleiben dabei erhalten. „Nur speichern“ übernimmt die
        Werte erst beim nächsten Neustart.
      </p>
    </div>
  );
}

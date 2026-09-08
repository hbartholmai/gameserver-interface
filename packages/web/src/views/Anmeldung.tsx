import { useState } from 'react';
import { api, setCsrfToken } from '../api/client.js';
import type { SessionInfo } from '@gsp/shared';

/**
 * Anmeldung und Ersteinrichtung teilen sich eine Maske. Existiert noch kein
 * Konto, wird stattdessen eines angelegt.
 */
export function Anmeldung({
  ersteinrichtung,
  onAngemeldet,
}: {
  ersteinrichtung: boolean;
  onAngemeldet: (session: SessionInfo) => void;
}) {
  const [benutzer, setBenutzer] = useState('');
  const [passwort, setPasswort] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [sendet, setSendet] = useState(false);

  const absenden = async (event: React.FormEvent) => {
    event.preventDefault();
    setSendet(true);
    setFehler(null);
    try {
      const session = ersteinrichtung
        ? await api.setup(benutzer, passwort)
        : await api.login(benutzer, passwort);
      setCsrfToken(session.csrfToken);
      onAngemeldet(session);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Anmeldung fehlgeschlagen');
    } finally {
      setSendet(false);
    }
  };

  return (
    <div className="anmeldung">
      <form className="anmeldung__box" onSubmit={(e) => void absenden(e)}>
        <div className="anmeldung__marke">
          <span className="kopfzeile__wuerfel" aria-hidden="true">
            GS
          </span>
          <h1 className="kopfzeile__titel">Server Control</h1>
        </div>

        <p className="kachel__label">
          {ersteinrichtung ? '// Ersteinrichtung — Administrator anlegen' : '// Anmeldung'}
        </p>

        <div className="feld__eingabe">
          <label className="feld__label" htmlFor="benutzer">
            Benutzername
          </label>
          <input
            id="benutzer"
            value={benutzer}
            autoComplete="username"
            onChange={(event) => setBenutzer(event.target.value)}
            required
          />
        </div>

        <div className="feld__eingabe">
          <label className="feld__label" htmlFor="passwort">
            Passwort
          </label>
          <input
            id="passwort"
            type="password"
            value={passwort}
            autoComplete={ersteinrichtung ? 'new-password' : 'current-password'}
            onChange={(event) => setPasswort(event.target.value)}
            required
          />
          {ersteinrichtung && <span className="feld__hilfe">Mindestens 12 Zeichen.</span>}
        </div>

        {fehler && <span className="feld__fehler">{fehler}</span>}

        <button type="submit" className="knopf knopf--primaer" disabled={sendet}>
          {sendet ? 'Bitte warten…' : ersteinrichtung ? 'Konto anlegen' : 'Anmelden'}
        </button>
      </form>
    </div>
  );
}

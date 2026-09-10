import { useState } from 'react';
import { api, setCsrfToken } from '../api/client.js';
import { PANEL_VERSION, type SessionInfo } from '@gsp/shared';

/**
 * Anmeldung und Ersteinrichtung teilen sich eine Maske. Existiert noch kein
 * Konto, wird stattdessen eines angelegt.
 */
export function Login({
  firstRun,
  onAngemeldet,
}: {
  firstRun: boolean;
  onAngemeldet: (session: SessionInfo) => void;
}) {
  const [user, setBenutzer] = useState('');
  const [passwort, setPasswort] = useState('');
  const [errors, setErrors] = useState<string | null>(null);
  const [sendet, setSendet] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSendet(true);
    setErrors(null);
    try {
      const session = firstRun
        ? await api.setup(user, passwort)
        : await api.login(user, passwort);
      setCsrfToken(session.csrfToken);
      onAngemeldet(session);
    } catch (err) {
      setErrors(err instanceof Error ? err.message : 'Anmeldung fehlgeschlagen');
    } finally {
      setSendet(false);
    }
  };

  return (
    <div className="login">
      <form className="login__box" onSubmit={(e) => void submit(e)}>
        <div className="login__brand">
          <span className="header__cube" aria-hidden="true">
            GS
          </span>
          <h1 className="header__title">Server Control</h1>
          {/* Auch hier: Wer sich nicht anmelden kann, soll trotzdem sagen
              können, welche Fassung vor ihm steht. */}
          <span className="header__version">{PANEL_VERSION}</span>
        </div>

        <p className="tile__label">
          {firstRun ? '// Ersteinrichtung — Administrator anlegen' : '// Anmeldung'}
        </p>

        <div className="field__input">
          <label className="field__label" htmlFor="benutzer">
            Benutzername
          </label>
          <input
            id="benutzer"
            value={user}
            autoComplete="username"
            onChange={(event) => setBenutzer(event.target.value)}
            required
          />
        </div>

        <div className="field__input">
          <label className="field__label" htmlFor="passwort">
            Passwort
          </label>
          <input
            id="passwort"
            type="password"
            value={passwort}
            autoComplete={firstRun ? 'new-password' : 'current-password'}
            onChange={(event) => setPasswort(event.target.value)}
            required
          />
          {firstRun && <span className="field__help">Mindestens 12 Zeichen.</span>}
        </div>

        {errors && <span className="field__error">{errors}</span>}

        <button type="submit" className="button button--primary" disabled={sendet}>
          {sendet ? 'Bitte warten…' : firstRun ? 'Konto anlegen' : 'Anmelden'}
        </button>
      </form>
    </div>
  );
}

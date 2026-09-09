import { useCallback, useEffect, useState } from 'react';
import type { Job, TemplateDefinition } from '@gsp/shared';
import { api, ApiError, type KiStatus, type VorlagenInfo } from '../api/client.js';
import { SektionsLabel } from '../components/basis.js';
import { VorlagenEditor } from './VorlagenEditor.js';
import { TextFeld } from './vorlagen-teile.js';

/**
 * Verwaltung der Vorlagen: Liste links, Editor rechts. Erreichbar über die
 * Kopfzeile und bewusst als eigene Ansicht — Vorlagen gehören nicht zu einer
 * einzelnen Instanz, sondern liegen darüber.
 */
export function Vorlagen({ onSchliessen }: { onSchliessen: () => void }) {
  const [liste, setListe] = useState<VorlagenInfo[]>([]);
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [entwurf, setEntwurf] = useState<TemplateDefinition | null>(null);
  const [istNeu, setIstNeu] = useState(false);
  const [fehler, setFehler] = useState<{ field: string; message: string }[]>([]);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [beschaeftigt, setBeschaeftigt] = useState(false);
  const [kiStatus, setKiStatus] = useState<KiStatus | null>(null);
  const [kiOffen, setKiOffen] = useState(false);
  const [recherche, setRecherche] = useState<string | null>(null);

  const laden = useCallback(async () => {
    const antwort = await api.vorlagen();
    setListe(antwort.templates);
  }, []);

  useEffect(() => {
    void laden().catch(() => setMeldung('Vorlagen konnten nicht geladen werden'));
    void api
      .kiStatus()
      .then(setKiStatus)
      .catch(() => setKiStatus(null));
  }, [laden]);

  const aktuell = liste.find((v) => v.definition.id === gewaehlt) ?? null;

  const waehlen = (id: string) => {
    const info = liste.find((v) => v.definition.id === id);
    if (!info) return;
    setGewaehlt(id);
    setEntwurf(info.definition);
    setIstNeu(false);
    setFehler([]);
    setRecherche(null);
  };

  const speichern = async () => {
    if (!entwurf) return;
    setBeschaeftigt(true);
    setFehler([]);
    try {
      if (istNeu) await api.vorlageAnlegen(entwurf);
      else await api.vorlageSpeichern(entwurf.id, entwurf);
      await laden();
      setGewaehlt(entwurf.id);
      setIstNeu(false);
      setMeldung(`Vorlage „${entwurf.label}“ gespeichert`);
    } catch (err) {
      if (err instanceof ApiError) {
        setFehler(err.fields.length > 0 ? err.fields : [{ field: '', message: err.message }]);
      } else {
        setFehler([{ field: '', message: 'Speichern fehlgeschlagen' }]);
      }
    } finally {
      setBeschaeftigt(false);
    }
  };

  const loeschen = async () => {
    if (!entwurf) return;
    setBeschaeftigt(true);
    try {
      await api.vorlageLoeschen(entwurf.id);
      await laden();
      setGewaehlt(null);
      setEntwurf(null);
      setMeldung('Vorlage gelöscht');
    } catch (err) {
      setFehler([{ field: '', message: err instanceof Error ? err.message : 'Löschen fehlgeschlagen' }]);
    } finally {
      setBeschaeftigt(false);
    }
  };

  return (
    <div className="vorlagen">
      <div className="vorlagen__liste">
        <SektionsLabel text="Vorlagen" rechts={String(liste.length)} />
        {liste.map((info) => (
          <button
            key={info.definition.id}
            type="button"
            className={`vorlagenzeile${info.definition.id === gewaehlt ? ' vorlagenzeile--gewaehlt' : ''}`}
            onClick={() => waehlen(info.definition.id)}
          >
            <span className="vorlagenzeile__name">{info.definition.label}</span>
            <span className="vorlagenzeile__meta">
              {info.builtin ? 'mitgeliefert' : 'eigene'}
              {info.instances > 0 ? ` · ${info.instances}×` : ''}
            </span>
          </button>
        ))}

        <button
          type="button"
          className="knopf knopf--sekundaer"
          onClick={() => {
            setGewaehlt(null);
            setEntwurf(leereVorlage());
            setIstNeu(true);
            setFehler([]);
            setRecherche(null);
          }}
        >
          + Vorlage von Hand
        </button>

        {/* Ohne Schlüssel bleibt der Knopf weg, statt ins Leere zu laufen. */}
        {kiStatus?.available && (
          <button type="button" className="knopf knopf--sekundaer" onClick={() => setKiOffen(true)}>
            + Vorlage entwerfen lassen
          </button>
        )}

        <button type="button" className="knopf knopf--klein" onClick={onSchliessen}>
          Zurück zu den Instanzen
        </button>
      </div>

      <div className="vorlagen__editor">
        {meldung && (
          <div className="banner banner--warnung" role="status">
            <span style={{ flex: 1 }}>{meldung}</span>
            <button type="button" className="knopf knopf--klein" onClick={() => setMeldung(null)}>
              Schließen
            </button>
          </div>
        )}

        {recherche && (
          <details className="recherche" open>
            <summary>Belege der Recherche — bitte Ports und Variablennamen prüfen</summary>
            <pre className="recherche__text">{recherche}</pre>
          </details>
        )}

        {!entwurf && (
          <p className="leerzustand">
            // eine Vorlage auswählen, oder links eine neue anlegen
          </p>
        )}

        {entwurf && (
          <VorlagenEditor
            definition={entwurf}
            builtin={aktuell?.builtin ?? false}
            instanzen={aktuell?.instances ?? 0}
            neu={istNeu}
            fehler={fehler}
            beschaeftigt={beschaeftigt}
            onAendern={setEntwurf}
            onSpeichern={() => void speichern()}
            onLoeschen={() => void loeschen()}
            onAbbrechen={() => {
              setEntwurf(aktuell?.definition ?? null);
              setIstNeu(false);
              setFehler([]);
            }}
          />
        )}
      </div>

      {kiOffen && (
        <KiDialog
          onSchliessen={() => setKiOffen(false)}
          onEntwurf={(definition, belege) => {
            setKiOffen(false);
            setGewaehlt(null);
            setEntwurf(definition);
            setIstNeu(true);
            setRecherche(belege);
            setFehler([]);
          }}
        />
      )}
    </div>
  );
}

/**
 * Der KI-Entwurf. Er speichert nichts — das Ergebnis landet im Editor, mit den
 * Belegen daneben, damit Ports und Variablennamen prüfbar sind, bevor daraus
 * ein Container entsteht.
 */
function KiDialog({
  onSchliessen,
  onEntwurf,
}: {
  onSchliessen: () => void;
  onEntwurf: (definition: TemplateDefinition, recherche: string) => void;
}) {
  const [spiel, setSpiel] = useState('');
  const [image, setImage] = useState('');
  const [notizen, setNotizen] = useState('');
  const [job, setJob] = useState<Job | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  // Der Entwurf läuft als Job; hier genügt kurzes Nachfragen statt eines
  // eigenen Abonnements — er dauert Minuten, nicht Sekunden.
  useEffect(() => {
    if (!job || job.status !== 'running') return;
    const timer = window.setInterval(() => {
      void api
        .kiEntwurfHolen(job.id)
        .then((ergebnis) => {
          window.clearInterval(timer);
          onEntwurf(ergebnis.definition, ergebnis.research);
        })
        .catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [job, onEntwurf]);

  const starten = async () => {
    setFehler(null);
    try {
      const antwort = await api.kiEntwurfStarten(spiel, image, notizen);
      setJob(antwort.job);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Der Entwurf konnte nicht gestartet werden');
    }
  };

  return (
    <div className="dialog-hintergrund" role="dialog" aria-modal="true" aria-label="Vorlage entwerfen lassen">
      <div className="dialog">
        <div className="dialog__kopf">
          <h2 className="dialog__titel">Vorlage entwerfen</h2>
          <button type="button" className="knopf knopf--klein" onClick={onSchliessen}>
            Schließen
          </button>
        </div>

        <div className="dialog__koerper">
          {!job && (
            <>
              <p className="hinweis">
                Claude sucht die Dokumentation des Images und schlägt daraus eine Vorlage vor. Der
                Entwurf wird <b>nicht</b> gespeichert — er landet im Editor, samt Belegen zum
                Nachprüfen.
              </p>
              <TextFeld label="Spiel" wert={spiel} onAendern={setSpiel} />
              <TextFeld
                label="Docker-Image"
                wert={image}
                hilfe="Etwa itzg/minecraft-server — ohne Tag."
                onAendern={setImage}
              />
              <TextFeld
                label="Besonderheiten"
                wert={notizen}
                einzeilig={false}
                hilfe="Optional: was der Server können soll, bekannte Fallstricke."
                onAendern={setNotizen}
              />
              {fehler && <span className="feld__fehler">{fehler}</span>}
            </>
          )}

          {job && (
            <div className="fortschritt">
              <div className="fortschritt__kopf">
                <span className="fortschritt__phase">{job.message}</span>
                <span className="fortschritt__zahl">
                  {job.progress === null ? '—' : `${Math.round(job.progress)} %`}
                </span>
              </div>
              <p className="fortschritt__hinweis">
                Die Websuche dauert in der Regel ein bis drei Minuten. Der Entwurf öffnet sich
                anschließend von selbst im Editor.
              </p>
            </div>
          )}
        </div>

        <div className="dialog__fuss">
          <span className="hinweis" style={{ flex: 1 }} />
          <button
            type="button"
            className="knopf knopf--primaer"
            disabled={!spiel || !image || job !== null}
            onClick={() => void starten()}
          >
            {job ? 'Läuft…' : 'Entwerfen'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Eine leere, aber in sich stimmige Vorlage als Ausgangspunkt. */
function leereVorlage(): TemplateDefinition {
  return {
    id: '',
    label: '',
    summary: '',
    image: '',
    defaultTag: 'latest',
    defaultMemoryMb: 4096,
    defaultCpus: 2,
    notes: [],
    capabilities: { console: 'readonly', players: 'log', mods: 'none', moderation: false },
    ports: [
      { name: 'game', label: 'Spielport', container: 27015, protocol: 'udp', defaultHost: 27015, internalOnly: false },
    ],
    volumes: [{ name: 'data', containerPath: '/data', role: 'data' }],
    fields: [],
    env: [{ name: 'TZ', source: { kind: 'timezone' }, trim: false, omitWhenEmpty: false }],
    logPatterns: {
      join: { source: '', flags: '' },
      ready: { source: '', flags: '' },
    },
    backup: { paths: ['/data'], preCommands: [], postCommands: [] },
    validations: [],
    adapter: {},
    modExtensions: [],
  };
}

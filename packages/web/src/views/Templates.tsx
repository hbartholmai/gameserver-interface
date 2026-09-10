import { useCallback, useEffect, useState } from 'react';
import type { Job, TemplateDefinition } from '@gsp/shared';
import { api, ApiError, type KiStatus, type TemplateInfo } from '../api/client.js';
import { SectionLabel } from '../components/basics.js';
import { TemplateEditor } from './TemplateEditor.js';
import { TextField } from './editor-parts.js';

/**
 * Verwaltung der Vorlagen: Liste links, Editor rechts. Erreichbar über die
 * Kopfzeile und bewusst als eigene Ansicht — Vorlagen gehören nicht zu einer
 * einzelnen Instanz, sondern liegen darüber.
 */
export function Templates({ onClose }: { onClose: () => void }) {
  const [list, setList] = useState<TemplateInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [entwurf, setEntwurf] = useState<TemplateDefinition | null>(null);
  const [istNeu, setIstNeu] = useState(false);
  const [errors, setErrors] = useState<{ field: string; message: string }[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kiStatus, setKiStatus] = useState<KiStatus | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [research, setResearch] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await api.manageTemplates();
    setList(response.templates);
  }, []);

  useEffect(() => {
    void load().catch(() => setMessage('Vorlagen konnten nicht geladen werden'));
    void api
      .kiStatus()
      .then(setKiStatus)
      .catch(() => setKiStatus(null));
  }, [load]);

  const aktuell = list.find((v) => v.definition.id === selected) ?? null;

  const waehlen = (id: string) => {
    const info = list.find((v) => v.definition.id === id);
    if (!info) return;
    setSelected(id);
    setEntwurf(info.definition);
    setIstNeu(false);
    setErrors([]);
    setResearch(null);
  };

  const speichern = async () => {
    if (!entwurf) return;
    setBusy(true);
    setErrors([]);
    try {
      if (istNeu) await api.createTemplate(entwurf);
      else await api.saveTemplate(entwurf.id, entwurf);
      await load();
      setSelected(entwurf.id);
      setIstNeu(false);
      setMessage(`Vorlage „${entwurf.label}“ gespeichert`);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields.length > 0 ? err.fields : [{ field: '', message: err.message }]);
      } else {
        setErrors([{ field: '', message: 'Speichern fehlgeschlagen' }]);
      }
    } finally {
      setBusy(false);
    }
  };

  const loeschen = async () => {
    if (!entwurf) return;
    setBusy(true);
    try {
      await api.deleteTemplate(entwurf.id);
      await load();
      setSelected(null);
      setEntwurf(null);
      setMessage('Vorlage gelöscht');
    } catch (err) {
      setErrors([{ field: '', message: err instanceof Error ? err.message : 'Löschen fehlgeschlagen' }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="templates">
      <div className="templates__list">
        <SectionLabel text="Vorlagen" right={String(list.length)} />
        {list.map((info) => (
          <button
            key={info.definition.id}
            type="button"
            className={`templaterow${info.definition.id === selected ? ' templaterow--selected' : ''}`}
            onClick={() => waehlen(info.definition.id)}
          >
            <span className="templaterow__name">{info.definition.label}</span>
            <span className="templaterow__meta">
              {info.builtin ? 'mitgeliefert' : 'eigene'}
              {info.instances > 0 ? ` · ${info.instances}×` : ''}
            </span>
          </button>
        ))}

        <button
          type="button"
          className="button button--secondary"
          onClick={() => {
            setSelected(null);
            setEntwurf(leereVorlage());
            setIstNeu(true);
            setErrors([]);
            setResearch(null);
          }}
        >
          + Vorlage von Hand
        </button>

        {/* Ohne Schlüssel bleibt der Knopf weg, statt ins Leere zu laufen. */}
        {kiStatus?.available && (
          <button type="button" className="button button--secondary" onClick={() => setAiOpen(true)}>
            + Vorlage entwerfen lassen
          </button>
        )}

        <button type="button" className="button button--small" onClick={onClose}>
          Zurück zu den Instanzen
        </button>
      </div>

      <div className="templates__editor">
        {message && (
          <div className="banner banner--warn" role="status">
            <span style={{ flex: 1 }}>{message}</span>
            <button type="button" className="button button--small" onClick={() => setMessage(null)}>
              Schließen
            </button>
          </div>
        )}

        {research && (
          <details className="research" open>
            <summary>Belege der Recherche — bitte Ports und Variablennamen prüfen</summary>
            <pre className="research__text">{research}</pre>
          </details>
        )}

        {!entwurf && (
          <p className="empty">
            // eine Vorlage auswählen, oder links eine neue anlegen
          </p>
        )}

        {entwurf && (
          <TemplateEditor
            definition={entwurf}
            builtin={aktuell?.builtin ?? false}
            instanzen={aktuell?.instances ?? 0}
            neu={istNeu}
            errors={errors}
            busy={busy}
            onChange={setEntwurf}
            onSave={() => void speichern()}
            onDelete={() => void loeschen()}
            onCancel={() => {
              setEntwurf(aktuell?.definition ?? null);
              setIstNeu(false);
              setErrors([]);
            }}
          />
        )}
      </div>

      {aiOpen && (
        <KiDialog
          onClose={() => setAiOpen(false)}
          onEntwurf={(definition, belege) => {
            setAiOpen(false);
            setSelected(null);
            setEntwurf(definition);
            setIstNeu(true);
            setResearch(belege);
            setErrors([]);
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
  onClose,
  onEntwurf,
}: {
  onClose: () => void;
  onEntwurf: (definition: TemplateDefinition, research: string) => void;
}) {
  const [spiel, setSpiel] = useState('');
  const [image, setImage] = useState('');
  const [notizen, setNotizen] = useState('');
  const [job, setJob] = useState<Job | null>(null);
  const [errors, setErrors] = useState<string | null>(null);

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
    setErrors(null);
    try {
      const response = await api.kiEntwurfStarten(spiel, image, notizen);
      setJob(response.job);
    } catch (err) {
      setErrors(err instanceof Error ? err.message : 'Der Entwurf konnte nicht gestartet werden');
    }
  };

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label="Vorlage entwerfen lassen">
      <div className="dialog">
        <div className="dialog__head">
          <h2 className="dialog__title">Vorlage entwerfen</h2>
          <button type="button" className="button button--small" onClick={onClose}>
            Schließen
          </button>
        </div>

        <div className="dialog__body">
          {!job && (
            <>
              <p className="hint">
                Gemini sucht die Dokumentation des Images und schlägt daraus eine Vorlage vor. Der
                Entwurf wird <b>nicht</b> gespeichert — er landet im Editor, samt Belegen zum
                Nachprüfen.
              </p>
              <TextField label="Spiel" value={spiel} onChange={setSpiel} />
              <TextField
                label="Docker-Image"
                value={image}
                help="Etwa itzg/minecraft-server — ohne Tag."
                onChange={setImage}
              />
              <TextField
                label="Besonderheiten"
                value={notizen}
                singleLine={false}
                help="Optional: was der Server können soll, bekannte Fallstricke."
                onChange={setNotizen}
              />
              {errors && <span className="field__error">{errors}</span>}
            </>
          )}

          {job && (
            <div className="progress">
              <div className="progress__head">
                <span className="progress__phase">{job.message}</span>
                <span className="progress__count">
                  {job.progress === null ? '—' : `${Math.round(job.progress)} %`}
                </span>
              </div>
              <p className="progress__note">
                Die Websuche dauert in der Regel ein bis drei Minuten. Der Entwurf öffnet sich
                anschließend von selbst im Editor.
              </p>
            </div>
          )}
        </div>

        <div className="dialog__foot">
          <span className="hint" style={{ flex: 1 }} />
          <button
            type="button"
            className="button button--primary"
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

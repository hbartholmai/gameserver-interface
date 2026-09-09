import { useEffect, useMemo, useState } from 'react';
import type { CreateInstanceRequest, Instance, Job, LogLine, TemplateDescriptor } from '@gsp/shared';
import { api, ApiError } from '../api/client.js';
import { Feld, type Wert } from '../components/Feld.js';
import { SektionsLabel } from '../components/basis.js';
import { Aufbau, phaseVon } from '../components/Aufbau.js';

/** Vorbelegung aus den Feld-Defaults der gewählten Vorlage. */
function defaults(vorlage: TemplateDescriptor): Record<string, Wert> {
  const werte: Record<string, Wert> = {};
  for (const feld of vorlage.fields) {
    if (feld.default !== undefined) werte[feld.id] = feld.default;
    else if (feld.type === 'boolean') werte[feld.id] = false;
    else if (feld.type === 'number') werte[feld.id] = feld.min ?? 0;
    else werte[feld.id] = '';
  }
  return werte;
}

export function NeueInstanz({
  vorlagen,
  aufbauInstanz,
  aufbauJob,
  aufbauLogs,
  onSchliessen,
  onAngelegt,
}: {
  vorlagen: TemplateDescriptor[];
  /**
   * Gesetzt, sobald die Instanz angelegt ist. Der Dialog schließt dann nicht,
   * sondern begleitet den Aufbau — das Laden des Images und das Hochfahren des
   * Servers sind der Teil, der Minuten dauert.
   */
  aufbauInstanz: Instance | null;
  aufbauJob: Job | null;
  aufbauLogs: LogLine[];
  onSchliessen: () => void;
  onAngelegt: (id: string) => void;
}) {
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [werte, setWerte] = useState<Record<string, Wert>>({});
  const [ports, setPorts] = useState<Record<string, number>>({});
  const [memoryMb, setMemoryMb] = useState(4096);
  const [cpus, setCpus] = useState(2);
  const [backupCron, setBackupCron] = useState('0 4 * * *');
  const [keepDays, setKeepDays] = useState(7);
  const [fehler, setFehler] = useState<Record<string, string>>({});
  const [meldung, setMeldung] = useState<string | null>(null);
  const [sendet, setSendet] = useState(false);
  const [angelegt, setAngelegt] = useState(false);

  const vorlage = useMemo(
    () => vorlagen.find((v) => v.id === gewaehlt) ?? null,
    [vorlagen, gewaehlt],
  );

  // Vorlagenwechsel setzt Formular, Ressourcen und freie Ports neu.
  useEffect(() => {
    if (!vorlage) return;
    setWerte(defaults(vorlage));
    setMemoryMb(vorlage.defaultMemoryMb);
    setCpus(vorlage.defaultCpus);
    setFehler({});
    setMeldung(null);
    void api
      .suggestedPorts(vorlage.id)
      .then((antwort) => setPorts(antwort.ports))
      .catch(() => {
        const vorgabe: Record<string, number> = {};
        for (const port of vorlage.ports) {
          if (!port.internalOnly) vorgabe[port.name] = port.defaultHost;
        }
        setPorts(vorgabe);
      });
  }, [vorlage]);

  const absenden = async () => {
    if (!vorlage) return;
    if (!name.trim()) {
      setFehler({ name: 'Ein Name ist erforderlich' });
      return;
    }
    setSendet(true);
    setMeldung(null);
    setFehler({});

    const anfrage: CreateInstanceRequest = {
      game: vorlage.id,
      name: name.trim(),
      tag: vorlage.defaultTag,
      ports: Object.entries(ports).map(([portName, host]) => ({ name: portName, host })),
      memoryMb,
      cpus,
      settings: werte,
      backupCron,
      backupKeepDays: keepDays,
    };

    try {
      const antwort = await api.createInstance(anfrage);
      setAngelegt(true);
      onAngelegt(antwort.id);
    } catch (err) {
      if (err instanceof ApiError && err.fields.length > 0) {
        const felder: Record<string, string> = {};
        for (const eintrag of err.fields) felder[eintrag.field] = eintrag.message;
        setFehler(felder);
        setMeldung(err.message);
      } else {
        setMeldung(err instanceof Error ? err.message : 'Anlegen fehlgeschlagen');
      }
    } finally {
      setSendet(false);
    }
  };

  // Ist die Instanz angelegt, begleitet derselbe Dialog den Aufbau, statt sich
  // zu schließen und den Nutzer im Unklaren zu lassen.
  if (angelegt) {
    const phase = phaseVon(aufbauJob, aufbauInstanz);
    const fertig = phase === 'fertig' || phase === 'fehler';
    return (
      <div
        className="dialog-hintergrund"
        role="dialog"
        aria-modal="true"
        aria-label="Instanz wird aufgesetzt"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onSchliessen();
        }}
      >
        <div className="dialog">
          <div className="dialog__kopf">
            <h2 className="dialog__titel">{aufbauInstanz?.name ?? 'Neue Instanz'}</h2>
            <button type="button" className="knopf knopf--klein" onClick={onSchliessen}>
              Schließen
            </button>
          </div>

          <div className="dialog__koerper">
            {/* Während des Jobs existiert der Container noch nicht; der Instanzstatus
                lautet dann „Fehler“ und wäre hier irreführend. */}
            <SektionsLabel
              text="Instanz wird aufgesetzt"
              rechts={phase === 'job' ? 'wird aufgebaut' : (aufbauInstanz?.status ?? '')}
            />
            <Aufbau instanz={aufbauInstanz} job={aufbauJob} logs={aufbauLogs} />
          </div>

          <div className="dialog__fuss">
            <span className="hinweis" style={{ flex: 1 }}>
              {fertig ? '' : 'Der Aufbau läuft weiter, auch wenn du den Dialog schließt.'}
            </span>
            <button
              type="button"
              className={fertig ? 'knopf knopf--primaer' : 'knopf knopf--sekundaer'}
              onClick={onSchliessen}
            >
              {fertig ? 'Fertig' : 'Im Hintergrund weiter'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="dialog-hintergrund"
      role="dialog"
      aria-modal="true"
      aria-label="Neue Instanz anlegen"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onSchliessen();
      }}
    >
      <div className="dialog">
        <div className="dialog__kopf">
          <h2 className="dialog__titel">Neue Instanz</h2>
          <button type="button" className="knopf knopf--klein" onClick={onSchliessen}>
            Schließen
          </button>
        </div>

        <div className="dialog__koerper">
          <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
            <SektionsLabel text="Vorlage" />
            <div className="vorlagenwahl">
              {vorlagen.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className={`vorlagenkarte${v.id === gewaehlt ? ' vorlagenkarte--gewaehlt' : ''}`}
                  aria-pressed={v.id === gewaehlt}
                  onClick={() => setGewaehlt(v.id)}
                >
                  <span className="vorlagenkarte__name">{v.label}</span>
                  <span className="vorlagenkarte__text">{v.summary}</span>
                </button>
              ))}
            </div>
          </section>

          {vorlage && (
            <>
              {vorlage.notes.length > 0 && (
                <div className="notizen">
                  {vorlage.notes.map((notiz) => (
                    <span className="notiz" key={notiz}>
                      {notiz}
                    </span>
                  ))}
                </div>
              )}

              <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-5)' }}>
                <SektionsLabel text="Instanz" />
                <div className="feld">
                  <label className="feld__label" htmlFor="instanzname">
                    Anzeigename *
                  </label>
                  <div className="feld__eingabe">
                    <input
                      id="instanzname"
                      value={name}
                      maxLength={48}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="z. B. Midgard"
                      aria-invalid={fehler.name ? true : undefined}
                    />
                    {fehler.name && <span className="feld__fehler">{fehler.name}</span>}
                  </div>
                </div>

                {vorlage.fields.map((feld) => (
                  <Feld
                    key={feld.id}
                    spec={feld}
                    wert={werte[feld.id] ?? ''}
                    fehler={fehler[feld.id]}
                    onAendern={(wert) => setWerte((alt) => ({ ...alt, [feld.id]: wert }))}
                  />
                ))}
              </section>

              <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-5)' }}>
                <SektionsLabel text="Ports & Ressourcen" />
                {vorlage.ports
                  .filter((port) => !port.internalOnly)
                  .map((port) => (
                    <div className="feld" key={port.name}>
                      <label className="feld__label" htmlFor={`port-${port.name}`}>
                        {port.label} ({port.protocol})
                      </label>
                      <div className="feld__eingabe">
                        <input
                          id={`port-${port.name}`}
                          type="number"
                          min={1}
                          max={65535}
                          value={ports[port.name] ?? port.defaultHost}
                          onChange={(event) =>
                            setPorts((alt) => ({ ...alt, [port.name]: Number(event.target.value) }))
                          }
                          aria-invalid={fehler.ports ? true : undefined}
                        />
                      </div>
                    </div>
                  ))}
                {fehler.ports && <span className="feld__fehler">{fehler.ports}</span>}

                <ZahlFeld id="ram" label="Arbeitsspeicher (MB)" wert={memoryMb} min={512} step={512} onAendern={setMemoryMb} />
                <ZahlFeld id="cpus" label="CPU-Kerne" wert={cpus} min={0.5} step={0.5} onAendern={setCpus} />

                <div className="feld">
                  <label className="feld__label" htmlFor="backupcron">
                    Backup-Zeitplan
                  </label>
                  <div className="feld__eingabe">
                    <input
                      id="backupcron"
                      value={backupCron}
                      onChange={(event) => setBackupCron(event.target.value)}
                      placeholder="0 4 * * *"
                    />
                    <span className="feld__hilfe">Cron-Ausdruck. Leer lassen für keine automatischen Backups.</span>
                  </div>
                </div>
                <ZahlFeld id="keep" label="Aufbewahrung (Tage)" wert={keepDays} min={1} step={1} onAendern={setKeepDays} />
              </section>
            </>
          )}
        </div>

        <div className="dialog__fuss">
          <span className="feld__fehler">{meldung}</span>
          <div style={{ display: 'flex', gap: 'var(--s-3)' }}>
            <button type="button" className="knopf knopf--sekundaer" onClick={onSchliessen}>
              Abbrechen
            </button>
            <button
              type="button"
              className="knopf knopf--primaer"
              disabled={!vorlage || sendet}
              onClick={() => void absenden()}
            >
              {sendet ? 'Wird angelegt…' : 'Anlegen & starten'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ZahlFeld({
  id,
  label,
  wert,
  min,
  step,
  onAendern,
}: {
  id: string;
  label: string;
  wert: number;
  min: number;
  step: number;
  onAendern: (wert: number) => void;
}) {
  return (
    <div className="feld">
      <label className="feld__label" htmlFor={id}>
        {label}
      </label>
      <div className="feld__eingabe">
        <input
          id={id}
          type="number"
          min={min}
          step={step}
          value={wert}
          onChange={(event) => onAendern(Number(event.target.value))}
        />
      </div>
    </div>
  );
}

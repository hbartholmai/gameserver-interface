import { useRef } from 'react';
import { formatBytes, type Instance, type Mod } from '@gsp/shared';
import { Empty, SectionLabel } from '../components/basics.js';

export function Mods({
  instance,
  mods,
  extensions,
  onUmschalten,
  onDelete,
  onHinzufuegen,
}: {
  instance: Instance;
  mods: Mod[];
  /** Dateiendungen der Vorlage. Leer, solange die Vorlagen noch nicht geladen sind. */
  extensions: string[];
  onUmschalten: (mod: Mod) => void;
  onDelete: (mod: Mod) => void;
  onHinzufuegen: (file: File) => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  // Früher stand hier `.dll` oder `.jar`, je nach Fähigkeit. Das stimmte für
  // Valheim und Minecraft und log bei allem anderen — die Endungen stehen in
  // der Vorlage.
  const akzeptiert = extensions.join(',');
  const beschriftung = extensions.length > 0 ? ` (${extensions.join(', ')})` : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
      <SectionLabel text="Mods & Plugins" right={mods.length} />

      <div className="rows">
        {mods.length === 0 && <Empty text="keine Mods installiert" />}
        {mods.map((mod) => (
          <div className="row" key={mod.file}>
            <span className="row__name" title={mod.file}>
              {mod.name}
            </span>
            <span className="row__version">{mod.version}</span>
            <span
              className={`row__badge ${
                mod.updateAvailable
                  ? 'row__badge--update'
                  : mod.enabled
                    ? 'row__badge--active'
                    : 'row__badge--off'
              }`}
            >
              {mod.updateAvailable ? 'Update verfügbar' : mod.enabled ? 'aktiv' : 'deaktiviert'}
            </span>
            <span className="row__meta">{formatBytes(mod.sizeBytes)}</span>
            <button
              type="button"
              className="button button--small row__toggle"
              onClick={() => onUmschalten(mod)}
            >
              {mod.enabled ? 'Aus' : 'Ein'}
            </button>
            <button
              type="button"
              className="button button--small button--small-danger"
              onClick={() => onDelete(mod)}
            >
              Löschen
            </button>
          </div>
        ))}
      </div>

      <input
        ref={picker}
        type="file"
        {...(akzeptiert ? { accept: akzeptiert } : {})}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onHinzufuegen(file);
          event.target.value = '';
        }}
      />
      <button
        type="button"
        className="button button--dashed"
        onClick={() => picker.current?.click()}
      >
        + Mod hinzufügen{beschriftung}
      </button>

      <p className="hint">
        Änderungen werden erst nach einem Neustart der Instanz wirksam. Ob für eine Mod eine neuere
        Version vorliegt, kann das Panel nicht prüfen — es ist keine Mod-Quelle angebunden.
      </p>
    </div>
  );
}

import { useRef } from 'react';
import { formatBytes, type Instance, type Mod } from '@gsp/shared';
import { Leerzustand, SektionsLabel } from '../components/basis.js';

export function Mods({
  instanz,
  mods,
  onUmschalten,
  onLoeschen,
  onHinzufuegen,
}: {
  instanz: Instance;
  mods: Mod[];
  onUmschalten: (mod: Mod) => void;
  onLoeschen: (mod: Mod) => void;
  onHinzufuegen: (datei: File) => void;
}) {
  const auswahl = useRef<HTMLInputElement>(null);
  const endung = instanz.capabilities.mods === 'bepinex' ? '.dll' : '.jar';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
      <SektionsLabel text="Mods & Plugins" rechts={mods.length} />

      <div className="zeilen">
        {mods.length === 0 && <Leerzustand text="keine Mods installiert" />}
        {mods.map((mod) => (
          <div className="zeile" key={mod.file}>
            <span className="zeile__name" title={mod.file}>
              {mod.name}
            </span>
            <span className="zeile__version">{mod.version}</span>
            <span
              className={`zeile__badge ${
                mod.updateAvailable
                  ? 'zeile__badge--update'
                  : mod.enabled
                    ? 'zeile__badge--aktiv'
                    : 'zeile__badge--aus'
              }`}
            >
              {mod.updateAvailable ? 'Update verfügbar' : mod.enabled ? 'aktiv' : 'deaktiviert'}
            </span>
            <span className="zeile__meta">{formatBytes(mod.sizeBytes)}</span>
            <button
              type="button"
              className="knopf knopf--klein zeile__toggle"
              onClick={() => onUmschalten(mod)}
            >
              {mod.enabled ? 'Aus' : 'Ein'}
            </button>
            <button
              type="button"
              className="knopf knopf--klein knopf--klein-gefahr"
              onClick={() => onLoeschen(mod)}
            >
              Löschen
            </button>
          </div>
        ))}
      </div>

      <input
        ref={auswahl}
        type="file"
        accept={endung}
        hidden
        onChange={(event) => {
          const datei = event.target.files?.[0];
          if (datei) onHinzufuegen(datei);
          event.target.value = '';
        }}
      />
      <button
        type="button"
        className="knopf knopf--gestrichelt"
        onClick={() => auswahl.current?.click()}
      >
        + Mod hinzufügen ({endung})
      </button>

      <p className="hinweis">
        Änderungen werden erst nach einem Neustart der Instanz wirksam. Ob für eine Mod eine neuere
        Version vorliegt, kann das Panel nicht prüfen — es ist keine Mod-Quelle angebunden.
      </p>
    </div>
  );
}

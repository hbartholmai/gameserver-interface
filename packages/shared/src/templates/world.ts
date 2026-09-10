import type { FieldValues, GameTemplate, WorldDefinition, WorldPart } from '../schema/template.js';

/**
 * Auflösung der Weltangabe einer Vorlage gegen die Einstellungen einer Instanz.
 *
 * Liegt in `shared`, weil hier nur aus Vorlage und Formularwerten Container-Pfade
 * werden — ohne Dateisystem, ohne Host-Pfade. Das Übersetzen auf den Host macht
 * `toHostPath()` im Server. Dadurch ist der Teil, an dem ein Fehler Weltdaten
 * kostet, ohne Docker und ohne Platte prüfbar.
 */

/** Ein aufgelöster Teil der Welt. */
export interface WorldTargetPart {
  /** Container-Pfad, etwa `/data/welt_nether`. */
  containerPath: string;
  /** Name im Elternverzeichnis, etwa `welt_nether`. */
  fileName: string;
  suffix: string;
  type: 'dir' | 'file';
  required: boolean;
}

export interface WorldTarget {
  parent: string;
  /** Gemeinsamer Stamm, aufgelöst und geprüft. */
  base: string;
  parts: WorldTargetPart[];
  /** Die Welt selbst — nach Vereinbarung der erste Teil. */
  haupt: WorldTargetPart;
  markers: string[];
  accept: string[];
}

/** Der Weltname taugt nicht als Pfadbestandteil. */
export class WorldNameError extends Error {}

/**
 * Der Stamm kommt bei fast allen Vorlagen aus einem Formularfeld und ist damit
 * Benutzereingabe. Nicht jede Vorlage prüft ihn — Valheims `worldName` hat nur
 * eine Längengrenze, keine Zeichenregel. Deshalb wird hier hart abgelehnt statt
 * gehofft; `isInside()` im Server fängt es ein zweites Mal ab.
 */
const VERBOTEN = /[\\/:\0]/;
const MAX_LAENGE = 128;

function pruefeStamm(stamm: string, herkunft: string): string {
  const wert = stamm.trim();
  if (wert === '') throw new WorldNameError(`${herkunft} ist leer`);
  if (wert === '.' || wert === '..') throw new WorldNameError(`${herkunft} darf nicht „${wert}“ sein`);
  if (VERBOTEN.test(wert)) throw new WorldNameError(`${herkunft} darf keine Pfadanteile enthalten`);
  if (/[\u0000-\u001f\u007f]/.test(wert)) throw new WorldNameError(`${herkunft} enthält Steuerzeichen`);
  if (wert.length > MAX_LAENGE) throw new WorldNameError(`${herkunft} ist länger als ${MAX_LAENGE} Zeichen`);
  return wert;
}

/** Löst den Weltnamen auf. Wirft, wenn er als Pfadbestandteil untauglich ist. */
export function worldBase(world: WorldDefinition, values: FieldValues): string {
  if (world.name.kind === 'const') {
    return pruefeStamm(world.name.value, 'Der Weltname der Vorlage');
  }
  const roh = values[world.name.field];
  if (roh === undefined) {
    throw new WorldNameError(`Das Feld „${world.name.field}“ fehlt in den Einstellungen`);
  }
  return pruefeStamm(String(roh), `Das Feld „${world.name.field}“`);
}

function teil(parent: string, base: string, part: WorldPart): WorldTargetPart {
  const fileName = `${base}${part.suffix}`;
  return {
    containerPath: `${parent.replace(/\/+$/, '')}/${fileName}`,
    fileName,
    suffix: part.suffix,
    type: part.type,
    required: part.required,
  };
}

/**
 * Löst die Weltangabe einer Vorlage auf. `null`, wenn die Vorlage keine Welt
 * benennt — CS2, TF2 und Garry's Mod haben keine.
 */
export function worldTarget(template: GameTemplate, values: FieldValues): WorldTarget | null {
  const world = template.world;
  if (!world) return null;

  const base = worldBase(world, values);
  const parts = world.parts.map((part) => teil(world.parent, base, part));
  // `parts` hat laut Schema mindestens einen Eintrag; die Prüfung ist nur das
  // Netz darunter, weil `noUncheckedIndexedAccess` sie ohnehin verlangt.
  const haupt = parts[0];
  if (!haupt) throw new WorldNameError('Die Vorlage benennt keine Teile der Welt');

  return {
    parent: world.parent.replace(/\/+$/, ''),
    base,
    parts,
    haupt,
    markers: world.markers,
    accept: world.accept,
  };
}

/** Die Teile, die beim Einspielen zwingend im Archiv stehen müssen. */
export function erforderlichBeimImport(ziel: WorldTarget): WorldTargetPart[] {
  return ziel.parts.filter((p) => p.required);
}

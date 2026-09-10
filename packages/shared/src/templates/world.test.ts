import { describe, expect, it } from 'vitest';
import { compileTemplate } from './compile.js';
import { WorldNameError, erforderlichBeimImport, worldTarget } from './world.js';
import { minecraftDefinition } from './minecraft.js';
import type { TemplateDefinition } from '../schema/template-definition.js';

/**
 * Die Auflösung von Vorlage plus Einstellungen zu Container-Pfaden. Hier fällt
 * ein Fehler nicht auf, sondern kostet Weltdaten — deshalb steht der Teil ohne
 * Dateisystem und ohne Docker unter Test.
 */

/**
 * Eine Vorlage mit ausgetauschtem Weltblock, sonst Minecraft. `undefined`
 * entfernt den Block — Minecraft bringt inzwischen einen mit, ein Spread mit
 * leerem Objekt ließe ihn also stehen.
 */
function mitWelt(world: TemplateDefinition['world']): ReturnType<typeof compileTemplate> {
  const definition = { ...minecraftDefinition } as TemplateDefinition;
  if (world) definition.world = world;
  else delete definition.world;
  return compileTemplate(definition);
}

describe('worldTarget', () => {
  it('löst den Stamm aus einem Formularfeld auf', () => {
    const ziel = worldTarget(mitWelt(minecraftDefinition.world), { levelName: 'nordheim' });
    expect(ziel?.base).toBe('nordheim');
    expect(ziel?.parts.map((p) => p.containerPath)).toEqual([
      '/data/nordheim',
      '/data/nordheim_nether',
      '/data/nordheim_the_end',
    ]);
  });

  it('löst einen festen Stamm ohne Formularfeld auf', () => {
    const ziel = worldTarget(
      mitWelt({
        parent: '/opt/enshrouded',
        name: { kind: 'const', value: 'savegame' },
        parts: [{ suffix: '', type: 'dir', required: true }],
        markers: [],
        accept: [],
      }),
      {},
    );
    expect(ziel?.haupt.containerPath).toBe('/opt/enshrouded/savegame');
  });

  it('gibt null zurück, wenn die Vorlage keine Welt benennt', () => {
    expect(worldTarget(mitWelt(undefined), { levelName: 'welt' })).toBeNull();
  });

  /*
   * Der Stamm ist bei fast allen Vorlagen Benutzereingabe, und nicht jede
   * Vorlage prüft ihn. Ein `../..` hier bedeutete, dass der Austausch außerhalb
   * des Instanzverzeichnisses löscht.
   */
  it.each([
    ['..', 'Punktpfad'],
    ['.', 'Punkt'],
    ['a/b', 'Schrägstrich'],
    ['a\\b', 'Backslash'],
    ['C:x', 'Doppelpunkt'],
    ['', 'leer'],
    ['   ', 'nur Leerraum'],
    ['x'.repeat(129), 'zu lang'],
  ])('lehnt „%s“ als Weltnamen ab (%s)', (name) => {
    expect(() => worldTarget(mitWelt(minecraftDefinition.world), { levelName: name })).toThrow(WorldNameError);
  });

  it('lehnt einen Weltnamen mit Steuerzeichen ab', () => {
    expect(() =>
      worldTarget(mitWelt(minecraftDefinition.world), { levelName: `welt${String.fromCharCode(9)}` }),
    ).not.toThrow(); // Tabulator wird von trim() entfernt
    expect(() =>
      worldTarget(mitWelt(minecraftDefinition.world), { levelName: `wel${String.fromCharCode(0)}t` }),
    ).toThrow(WorldNameError);
  });

  it('meldet ein fehlendes Namensfeld statt still zu raten', () => {
    expect(() => worldTarget(mitWelt(minecraftDefinition.world), {})).toThrow(WorldNameError);
  });
});

describe('erforderlichBeimImport', () => {
  it('verlangt bei Minecraft nur die Welt selbst, nicht die Dimensionen', () => {
    const ziel = worldTarget(mitWelt(minecraftDefinition.world), { levelName: 'welt' })!;
    expect(erforderlichBeimImport(ziel).map((p) => p.fileName)).toEqual(['welt']);
  });

  /*
   * Eine `.fwl` trägt Name und Seed, die `.db` die Karte. Eine ohne die andere
   * ergibt eine leere Welt — deshalb müssen beide kommen, die `.old`-Kopien
   * dagegen nicht.
   */
  it('verlangt bei Valheim beide Weltdateien, aber keine .old-Kopie', () => {
    const ziel = worldTarget(
      mitWelt({
        parent: '/config/worlds_local',
        name: { kind: 'field', field: 'worldName' },
        parts: [
          { suffix: '.fwl', type: 'file', required: true },
          { suffix: '.db', type: 'file', required: true },
          { suffix: '.fwl.old', type: 'file', required: false },
          { suffix: '.db.old', type: 'file', required: false },
        ],
        markers: [],
        accept: [],
      }),
      { worldName: 'Midgard' },
    )!;
    expect(erforderlichBeimImport(ziel).map((p) => p.fileName)).toEqual(['Midgard.fwl', 'Midgard.db']);
  });
});

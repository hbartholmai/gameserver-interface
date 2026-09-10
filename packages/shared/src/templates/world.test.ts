import { describe, expect, it } from 'vitest';
import { compileTemplate } from './compile.js';
import { WorldNameError, requiredOnImport, worldTarget } from './world.js';
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
function withWorld(world: TemplateDefinition['world']): ReturnType<typeof compileTemplate> {
  const definition = { ...minecraftDefinition } as TemplateDefinition;
  if (world) definition.world = world;
  else delete definition.world;
  return compileTemplate(definition);
}

describe('worldTarget', () => {
  it('löst den Stamm aus einem Formularfeld auf', () => {
    const target = worldTarget(withWorld(minecraftDefinition.world), { levelName: 'nordheim' });
    expect(target?.base).toBe('nordheim');
    expect(target?.parts.map((p) => p.containerPath)).toEqual([
      '/data/nordheim',
      '/data/nordheim_nether',
      '/data/nordheim_the_end',
    ]);
  });

  it('löst einen festen Stamm ohne Formularfeld auf', () => {
    const target = worldTarget(
      withWorld({
        parent: '/opt/enshrouded',
        name: { kind: 'const', value: 'savegame' },
        parts: [{ suffix: '', type: 'dir', required: true }],
        markers: [],
        accept: [],
      }),
      {},
    );
    expect(target?.main.containerPath).toBe('/opt/enshrouded/savegame');
  });

  it('gibt null zurück, wenn die Vorlage keine Welt benennt', () => {
    expect(worldTarget(withWorld(undefined), { levelName: 'welt' })).toBeNull();
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
    expect(() => worldTarget(withWorld(minecraftDefinition.world), { levelName: name })).toThrow(WorldNameError);
  });

  it('lehnt einen Weltnamen mit Steuerzeichen ab', () => {
    expect(() =>
      worldTarget(withWorld(minecraftDefinition.world), { levelName: `welt${String.fromCharCode(9)}` }),
    ).not.toThrow(); // Tabulator wird von trim() entfernt
    expect(() =>
      worldTarget(withWorld(minecraftDefinition.world), { levelName: `wel${String.fromCharCode(0)}t` }),
    ).toThrow(WorldNameError);
  });

  it('meldet ein fehlendes Namensfeld statt still zu raten', () => {
    expect(() => worldTarget(withWorld(minecraftDefinition.world), {})).toThrow(WorldNameError);
  });
});

describe('erforderlichBeimImport', () => {
  it('verlangt bei Minecraft nur die Welt selbst, nicht die Dimensionen', () => {
    const target = worldTarget(withWorld(minecraftDefinition.world), { levelName: 'welt' })!;
    expect(requiredOnImport(target).map((p) => p.fileName)).toEqual(['welt']);
  });

  /*
   * Eine `.fwl` trägt Name und Seed, die `.db` die Karte. Eine ohne die andere
   * ergibt eine leere Welt — deshalb müssen beide kommen, die `.old`-Kopien
   * dagegen nicht.
   */
  it('verlangt bei Valheim beide Weltdateien, aber keine .old-Kopie', () => {
    const target = worldTarget(
      withWorld({
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
    expect(requiredOnImport(target).map((p) => p.fileName)).toEqual(['Midgard.fwl', 'Midgard.db']);
  });
});

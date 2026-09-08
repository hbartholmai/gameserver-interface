import { describe, expect, it } from 'vitest';
import {
  TEMPLATE_LIST,
  defaultValues,
  getTemplate,
  toDescriptor,
  validateSettings,
} from './index.js';
import type { TemplateContext } from '../schema/template.js';

const ctx: TemplateContext = {
  hostPorts: { game: 25565, query: 2457 },
  rconPassword: 'geheim123',
  timezone: 'Europe/Berlin',
};

describe('Vorlagen', () => {
  it('liefert für jedes Spiel eine Vorlage mit eindeutigen Feld- und Port-Namen', () => {
    for (const template of TEMPLATE_LIST) {
      const feldIds = template.fields.map((f) => f.id);
      expect(new Set(feldIds).size, `${template.id}: doppelte Feld-ID`).toBe(feldIds.length);

      const portNamen = template.ports.map((p) => p.name);
      expect(new Set(portNamen).size, `${template.id}: doppelter Port-Name`).toBe(portNamen.length);
    }
  });

  it('gibt nur Vorlagen mit Mod-Pfad als mod-fähig aus', () => {
    for (const template of TEMPLATE_LIST) {
      const hatPfad = template.modsPath !== undefined;
      expect(hatPfad, `${template.id}`).toBe(template.capabilities.mods !== 'none');
    }
  });

  it('sichert nur Pfade, die in einem Volume der Vorlage liegen', () => {
    for (const template of TEMPLATE_LIST) {
      for (const pfad of template.backup.paths) {
        const passend = template.volumes.some((v) => pfad.startsWith(v.containerPath));
        expect(passend, `${template.id}: ${pfad} liegt in keinem Volume`).toBe(true);
      }
    }
  });

  it('setzt Vorbefehle nur, wo eine schreibbare Konsole existiert', () => {
    for (const template of TEMPLATE_LIST) {
      if ((template.backup.preCommands ?? []).length > 0) {
        expect(template.capabilities.console, template.id).toBe('rcon');
      }
    }
  });

  it('entfernt beim Descriptor die nicht serialisierbaren Teile', () => {
    const descriptor = toDescriptor(getTemplate('minecraft'));
    expect(JSON.stringify(descriptor)).toContain('minecraft');
    expect('env' in descriptor).toBe(false);
    expect('logPatterns' in descriptor).toBe(false);
  });
});

describe('Umgebungsvariablen', () => {
  it('akzeptiert die Minecraft-EULA und übernimmt das RCON-Passwort', () => {
    const env = getTemplate('minecraft').env(
      { ...defaultValues(getTemplate('minecraft')), maxPlayers: 24, difficulty: 'hard' },
      ctx,
    );
    expect(env.EULA).toBe('TRUE');
    expect(env.ENABLE_RCON).toBe('TRUE');
    expect(env.RCON_PASSWORD).toBe('geheim123');
    expect(env.MAX_PLAYERS).toBe('24');
    expect(env.DIFFICULTY).toBe('hard');
  });

  it('lässt SEED weg, wenn kein Seed gesetzt ist', () => {
    const template = getTemplate('minecraft');
    expect(template.env({ ...defaultValues(template), seed: '' }, ctx).SEED).toBeUndefined();
    expect(template.env({ ...defaultValues(template), seed: 'abc' }, ctx).SEED).toBe('abc');
  });

  it('schaltet die bildeigenen Valheim-Backups ab, weil das Panel sie übernimmt', () => {
    const env = getTemplate('valheim').env(defaultValues(getTemplate('valheim')), ctx);
    expect(env.BACKUPS).toBe('false');
  });

  it('bildet Enshrouded-Zugänge auf Server-Rollen ab und lässt leere Rollen aus', () => {
    const template = getTemplate('enshrouded');
    const env = template.env(
      { ...defaultValues(template), adminPassword: 'admin1', guestPassword: '' },
      ctx,
    );
    expect(env.SERVER_ROLE_0_NAME).toBe('Admin');
    expect(env.SERVER_ROLE_0_PASSWORD).toBe('admin1');
    expect(env.SERVER_ROLE_2_PASSWORD).toBeUndefined();
    // Enshrouded nutzt nur noch den Query-Port.
    expect(env.SERVER_QUERYPORT).toBe('2457');
  });
});

describe('Validierung', () => {
  it('lehnt zu kurze Valheim-Passwörter ab', () => {
    const template = getTemplate('valheim');
    const fehler = validateSettings(template, {
      ...defaultValues(template),
      serverName: 'Test',
      worldName: 'Welt',
      password: 'abc',
    });
    expect(fehler.some((f) => f.field === 'password')).toBe(true);
  });

  it('lehnt ein Valheim-Passwort ab, das im Servernamen vorkommt', () => {
    const template = getTemplate('valheim');
    const fehler = validateSettings(template, {
      ...defaultValues(template),
      serverName: 'geheim-server',
      worldName: 'Welt',
      password: 'geheim',
    });
    expect(fehler.map((f) => f.message).join()).toContain('Server- oder Weltnamen');
  });

  it('verlangt für Enshrouded ein Admin-Passwort', () => {
    const template = getTemplate('enshrouded');
    const fehler = validateSettings(template, { ...defaultValues(template), adminPassword: '' });
    expect(fehler.some((f) => f.field === 'adminPassword')).toBe(true);
  });

  it('lehnt Weltnamen mit Pfadanteilen ab', () => {
    const template = getTemplate('minecraft');
    const fehler = validateSettings(template, {
      ...defaultValues(template),
      levelName: '../../etc',
    });
    expect(fehler.some((f) => f.field === 'levelName')).toBe(true);
  });

  it('akzeptiert gültige Standardwerte für alle Vorlagen', () => {
    const gueltig: Record<string, Record<string, string>> = {
      minecraft: {},
      valheim: { password: 'sicher123' },
      enshrouded: { adminPassword: 'admin123' },
    };
    for (const template of TEMPLATE_LIST) {
      const werte = { ...defaultValues(template), ...gueltig[template.id] };
      expect(validateSettings(template, werte), template.id).toEqual([]);
    }
  });
});

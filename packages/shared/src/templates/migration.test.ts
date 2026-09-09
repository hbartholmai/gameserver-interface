import { describe, expect, it } from 'vitest';
import type { FieldValues, TemplateContext } from '../schema/template.js';
import { compileTemplate } from './compile.js';
import { defaultValues } from './index.js';
import { minecraftDefinition } from './minecraft.js';
import { valheimDefinition } from './valheim.js';
import { enshroudedDefinition } from './enshrouded.js';

/**
 * Die Vorlagen waren bis zu diesem Umbau handgeschriebene TypeScript-Objekte
 * mit einer `env()`-Funktion. Unten stehen diese Funktionen **wortgleich** wie
 * vor dem Umbau; die Tests vergleichen sie gegen die kompilierte Definition.
 *
 * Zweck ist nicht, das alte Verhalten für immer festzuschreiben, sondern zu
 * belegen, dass die deklarative Abbildung dasselbe erzeugt — inklusive der
 * Feinheiten, die man beim Übersetzen leicht verliert: `?? '…'`-Vorgaben,
 * `=== false`-Vergleiche, das Trimmen des Seeds und die weggelassenen
 * Variablen. Die Datei darf verschwinden, sobald das Vertrauen groß genug ist.
 */

const ctx: TemplateContext = {
  hostPorts: { game: 27015, query: 27016, rcon: 25575 },
  rconPassword: 'geheim-rcon',
  timezone: 'Europe/Berlin',
};

const ctxOhneRcon: TemplateContext = { hostPorts: {}, timezone: 'UTC' };

// --- Die alten Funktionen, unverändert übernommen ---------------------------

function altMinecraft(values: FieldValues, c: TemplateContext): Record<string, string> {
  const seed = String(values.seed ?? '').trim();
  const env: Record<string, string> = {
    EULA: 'TRUE',
    TYPE: String(values.type ?? 'PAPER'),
    VERSION: String(values.version ?? 'LATEST'),
    MOTD: String(values.motd ?? ''),
    MAX_PLAYERS: String(values.maxPlayers ?? 20),
    DIFFICULTY: String(values.difficulty ?? 'normal'),
    LEVEL: String(values.levelName ?? 'world'),
    ENABLE_WHITELIST: values.whitelist ? 'TRUE' : 'FALSE',
    PVP: values.pvp === false ? 'FALSE' : 'TRUE',
    ONLINE_MODE: values.onlineMode === false ? 'FALSE' : 'TRUE',
    VIEW_DISTANCE: String(values.viewDistance ?? 10),
    ENABLE_RCON: 'TRUE',
    RCON_PORT: '25575',
    SERVER_PORT: String(c.hostPorts.game ?? 25565),
    TZ: c.timezone,
    ENABLE_AUTOPAUSE: 'FALSE',
    STOP_SERVER_ANNOUNCE_DELAY: '5',
  };
  if (seed) env.SEED = seed;
  if (c.rconPassword) env.RCON_PASSWORD = c.rconPassword;
  return env;
}

function altValheim(values: FieldValues, c: TemplateContext): Record<string, string> {
  return {
    SERVER_NAME: String(values.serverName ?? 'Valheim Server'),
    WORLD_NAME: String(values.worldName ?? 'Dedicated'),
    SERVER_PASS: String(values.password ?? ''),
    SERVER_PORT: String(c.hostPorts.game ?? 2456),
    SERVER_PUBLIC: values.public === false ? 'false' : 'true',
    SERVER_ARGS: values.crossplay === false ? '' : '-crossplay',
    SERVER_PRESET: String(values.preset ?? 'normal'),
    BEPINEX: values.bepinex ? 'true' : 'false',
    BACKUPS: 'false',
    UPDATE_CRON: String(values.updateCron ?? ''),
    TZ: c.timezone,
  };
}

function altEnshrouded(values: FieldValues, c: TemplateContext): Record<string, string> {
  const env: Record<string, string> = {
    SERVER_NAME: String(values.serverName ?? 'Enshrouded Server'),
    SERVER_SLOT_COUNT: String(values.slotCount ?? 16),
    SERVER_IP: '0.0.0.0',
    SERVER_QUERYPORT: String(c.hostPorts.query ?? 15637),
    SERVER_SAVE_DIR: './savegame',
    SERVER_LOG_DIR: './logs',
    SERVER_GAMESETTINGSPRESET: String(values.gameSettingsPreset ?? 'Default'),
    SERVER_ENABLE_VOICE_CHAT: values.voiceChat ? 'true' : 'false',
    SERVER_ENABLE_TEXT_CHAT: values.textChat === false ? 'false' : 'true',
    SERVER_ROLE_0_NAME: 'Admin',
    SERVER_ROLE_1_NAME: 'Friend',
    SERVER_ROLE_2_NAME: 'Guest',
    UPDATE_CRON: String(values.updateCron ?? ''),
    TZ: c.timezone,
  };
  const admin = String(values.adminPassword ?? '');
  const friend = String(values.friendPassword ?? '');
  const guest = String(values.guestPassword ?? '');
  if (admin) env.SERVER_ROLE_0_PASSWORD = admin;
  if (friend) env.SERVER_ROLE_1_PASSWORD = friend;
  if (guest) env.SERVER_ROLE_2_PASSWORD = guest;
  return env;
}

// --- Wertesätze -------------------------------------------------------------

/** Standard, alles leer, alle Booleans invertiert, Ränder. */
function saetze(definition: Parameters<typeof compileTemplate>[0]): FieldValues[] {
  const template = compileTemplate(definition);
  const standard = defaultValues(template);

  const invertiert: FieldValues = { ...standard };
  for (const feld of template.fields) {
    if (feld.type === 'boolean') invertiert[feld.id] = !(standard[feld.id] as boolean);
  }

  const leer: FieldValues = {};
  for (const feld of template.fields) {
    if (feld.type === 'boolean') leer[feld.id] = false;
    else if (feld.type === 'number') leer[feld.id] = 0;
    else leer[feld.id] = '';
  }

  return [standard, invertiert, leer, {}];
}

describe('Migration: kompilierte Vorlage erzeugt dieselbe Umgebung', () => {
  it('Minecraft', () => {
    const neu = compileTemplate(minecraftDefinition);
    for (const werte of saetze(minecraftDefinition)) {
      for (const c of [ctx, ctxOhneRcon]) {
        expect(neu.env(werte, c)).toEqual(altMinecraft(werte, c));
      }
    }
  });

  it('Minecraft: Seed wird getrimmt und bei Leerraum weggelassen', () => {
    const neu = compileTemplate(minecraftDefinition);
    expect(neu.env({ seed: '  ' }, ctx).SEED).toBeUndefined();
    expect(neu.env({ seed: '  abc  ' }, ctx).SEED).toBe('abc');
    expect(altMinecraft({ seed: '  ' }, ctx).SEED).toBeUndefined();
    expect(altMinecraft({ seed: '  abc  ' }, ctx).SEED).toBe('abc');
  });

  it('Enshrouded', () => {
    const neu = compileTemplate(enshroudedDefinition);
    for (const werte of saetze(enshroudedDefinition)) {
      for (const c of [ctx, ctxOhneRcon]) {
        expect(neu.env(werte, c)).toEqual(altEnshrouded(werte, c));
      }
    }
  });

  it('Valheim — bis auf das jetzt optionale Passwort', () => {
    const neu = compileTemplate(valheimDefinition);
    for (const werte of saetze(valheimDefinition)) {
      for (const c of [ctx, ctxOhneRcon]) {
        const mitPasswort = { ...werte, password: 'sicheresPasswort' };
        expect(neu.env(mitPasswort, c)).toEqual(altValheim(mitPasswort, c));
      }
    }
  });

  /**
   * Die einzige beabsichtigte Verhaltensänderung des Umbaus: früher schrieb die
   * Vorlage immer ein `SERVER_PASS`, notfalls leer, und das Feld war Pflicht.
   */
  it('Valheim ohne Passwort lässt SERVER_PASS weg, statt es leer zu setzen', () => {
    const neu = compileTemplate(valheimDefinition);
    const ohne = { ...defaultValues(neu), password: '' };

    expect(altValheim(ohne, ctx).SERVER_PASS).toBe('');
    expect(neu.env(ohne, ctx)).not.toHaveProperty('SERVER_PASS');

    const feld = neu.fields.find((f) => f.id === 'password');
    expect(feld?.required).toBe(false);
  });
});

describe('Migration: Log-Muster bleiben identisch', () => {
  const erwartet = [
    {
      name: 'Minecraft',
      definition: minecraftDefinition,
      join: /:\s*([A-Za-z0-9_]{1,16})\[\/[^\]]+\] logged in/,
      leave: /:\s*([A-Za-z0-9_]{1,16}) lost connection/,
      ready: /\]: Done \([\d.]+s\)! For help/,
      clean: (line: string) => line.replace(/^\[\d{2}:\d{2}:\d{2}\]\s*\[[^\]]+\]:\s*/, '').trimEnd(),
      beispiele: [
        '[12:34:56] [Server thread/INFO]: Kai_Baut[/1.2.3.4:5678] logged in with entity id 42',
        '[12:34:56] [Server thread/INFO]: Kai_Baut lost connection: Disconnected',
        '[12:34:56] [Server thread/INFO]: Done (12.000s)! For help, type "help"   ',
      ],
    },
    {
      name: 'Valheim',
      definition: valheimDefinition,
      join: /Got character ZDOID from (\S+)\s*:/,
      leave: undefined,
      ready: /(DungeonDB Start|Game server connected)/,
      clean: (line: string) => line.replace(/^\s*\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}:\s*/, '').trimEnd(),
      beispiele: [
        '09/09/2026 12:34:56: Got character ZDOID from Freyja_88 : -12345:6',
        '09/09/2026 12:34:56: DungeonDB Start 1200  ',
      ],
    },
    {
      name: 'Enshrouded',
      definition: enshroudedDefinition,
      join: /(?:Player|Character)\s+['"]?([^'"]+?)['"]?\s+(?:connected|joined)/i,
      leave: /(?:Player|Character)\s+['"]?([^'"]+?)['"]?\s+(?:disconnected|left)/i,
      ready: /(Server is now (?:online|listening)|HandleAssignmentReq|Session .* created)/i,
      clean: (line: string) => line.replace(/^\s*\[?\d{4}-\d{2}-\d{2}[ T][\d:.]+\]?\s*/, '').trimEnd(),
      beispiele: [
        "[2026-09-09 12:34:56] Player 'Skadi' connected",
        "[2026-09-09 12:34:56] Player 'Skadi' disconnected",
        '[2026-09-09 12:34:56] Server is now online   ',
      ],
    },
  ];

  for (const fall of erwartet) {
    it(fall.name, () => {
      const neu = compileTemplate(fall.definition).logPatterns;

      expect(neu.join.source).toBe(fall.join.source);
      expect(neu.join.flags).toBe(fall.join.flags);
      expect(neu.ready.source).toBe(fall.ready.source);
      expect(neu.ready.flags).toBe(fall.ready.flags);
      expect(neu.leave?.source).toBe(fall.leave?.source);

      // Nicht nur die Quelltexte, sondern das Ergebnis an echten Zeilen.
      for (const zeile of fall.beispiele) {
        expect(neu.clean?.(zeile)).toBe(fall.clean(zeile));
        expect(neu.join.test(zeile)).toBe(fall.join.test(zeile));
        expect(neu.ready.test(zeile)).toBe(fall.ready.test(zeile));
      }
    });
  }
});

import type { GameTemplate } from '../schema/template.js';
import { levelFromKeywords } from './util.js';

/**
 * Valheim auf Basis von `lloesche/valheim-server`.
 *
 * Wichtig: Das Valheim-Binary nimmt keine Befehle über stdin entgegen und hat
 * kein RCON — Admin-Befehle gibt es nur im Spiel über die F5-Konsole. Die
 * Panel-Konsole ist deshalb read-only. Die Spielerzahl kommt per Steam-A2S-Query
 * vom Query-Port, die Namen aus den `ZDOID`-Zeilen des Logs.
 */
export const valheimTemplate: GameTemplate = {
  id: 'valheim',
  label: 'Valheim',
  summary: 'Dedizierter Valheim-Server mit BepInEx-Unterstützung. Spielerzahl per Steam-Query, Konsole nur lesend.',
  image: 'lloesche/valheim-server',
  defaultTag: 'latest',
  defaultMemoryMb: 8192,
  defaultCpus: 4,
  notes: [
    'Valheim kennt kein RCON — die Konsole zeigt nur den Log-Stream, Befehle sind nicht möglich.',
    'Kick und Bann müssen im Spiel über die Admin-Konsole (F5) erfolgen.',
    'Das Serverpasswort muss mindestens 5 Zeichen haben und darf nicht im Server- oder Weltnamen vorkommen.',
  ],
  capabilities: {
    console: 'readonly',
    players: 'a2s',
    mods: 'bepinex',
    moderation: false,
  },
  ports: [
    { name: 'game', label: 'Spielport', container: 2456, protocol: 'udp', defaultHost: 2456, internalOnly: false },
    { name: 'query', label: 'Query-Port', container: 2457, protocol: 'udp', defaultHost: 2457, internalOnly: false },
  ],
  volumes: [
    { name: 'config', containerPath: '/config', role: 'config' },
    { name: 'data', containerPath: '/opt/valheim', role: 'data' },
  ],
  fields: [
    {
      id: 'serverName', label: 'Servername', type: 'text', default: 'Valheim Server',
      required: true, maxLength: 48, editable: true, restartRequired: true, secret: false,
    },
    {
      id: 'worldName', label: 'Welt', type: 'text', default: 'Dedicated',
      required: true, maxLength: 40, editable: false, restartRequired: true, secret: false,
      help: 'Name der Weltdatei — nach dem Anlegen nicht mehr änderbar.',
    },
    {
      id: 'password', label: 'Passwort', type: 'password', default: '',
      required: true, maxLength: 64, editable: true, restartRequired: true, secret: true,
      help: 'Mindestens 5 Zeichen, darf nicht Teil des Server- oder Weltnamens sein.',
    },
    {
      id: 'public', label: 'Öffentlich gelistet', type: 'boolean', default: true,
      required: false, editable: true, restartRequired: true, secret: false,
    },
    {
      id: 'crossplay', label: 'Crossplay', type: 'boolean', default: true,
      required: false, editable: true, restartRequired: true, secret: false,
      help: 'Erlaubt Beitritt über PlayFab zusätzlich zu Steam.',
    },
    {
      id: 'preset', label: 'Weltmodus', type: 'select', default: 'normal',
      options: [
        { value: 'casual', label: 'entspannt' },
        { value: 'easy', label: 'einfach' },
        { value: 'normal', label: 'normal' },
        { value: 'hard', label: 'schwer' },
        { value: 'hardcore', label: 'hardcore' },
      ],
      required: true, editable: true, restartRequired: true, secret: false,
    },
    {
      id: 'bepinex', label: 'BepInEx (Mods)', type: 'boolean', default: false,
      required: false, editable: true, restartRequired: true, secret: false,
      help: 'Lädt das Mod-Framework beim Start. Ohne BepInEx ist der Mod-Reiter leer.',
    },
    {
      id: 'updateCron', label: 'Update-Zeitplan', type: 'text', default: '0 5 * * *',
      required: false, maxLength: 40, editable: true, restartRequired: true, secret: false,
      help: 'Cron-Ausdruck für die automatische Spiel-Aktualisierung. Leer = aus.',
    },
  ],

  env(values, ctx) {
    const env: Record<string, string> = {
      SERVER_NAME: String(values.serverName ?? 'Valheim Server'),
      WORLD_NAME: String(values.worldName ?? 'Dedicated'),
      SERVER_PASS: String(values.password ?? ''),
      SERVER_PORT: String(ctx.hostPorts.game ?? 2456),
      SERVER_PUBLIC: values.public === false ? 'false' : 'true',
      SERVER_ARGS: values.crossplay === false ? '' : '-crossplay',
      SERVER_PRESET: String(values.preset ?? 'normal'),
      BEPINEX: values.bepinex ? 'true' : 'false',
      // Backups macht das Panel, damit Zeitplan und Aufbewahrung an einer Stelle liegen.
      BACKUPS: 'false',
      UPDATE_CRON: String(values.updateCron ?? ''),
      TZ: ctx.timezone,
    };
    return env;
  },

  logPatterns: {
    // `Got character ZDOID from Freyja_88 : -12345:6` — beim Beitritt und bei jedem Respawn.
    join: /Got character ZDOID from (\S+)\s*:/,
    // Valheim protokolliert beim Verlassen keinen Namen, nur die Socket-Kennung.
    // Die Spielerliste wird deshalb gegen die A2S-Zählung abgeglichen.
    ready: /(DungeonDB Start|Game server connected)/,
    level: levelFromKeywords,
    clean: (line) => line.replace(/^\s*\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}:\s*/, '').trimEnd(),
  },

  modsPath: '/config/bepinex/plugins',
  modExtensions: ['.dll'],

  backup: {
    paths: ['/config/worlds_local'],
  },
};

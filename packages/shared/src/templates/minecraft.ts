import type { GameTemplate } from '../schema/template.js';
import { levelFromKeywords } from './util.js';

/**
 * Minecraft auf Basis von `itzg/minecraft-server` — die Vorlage mit dem
 * größten Funktionsumfang: RCON gibt eine echte bidirektionale Konsole,
 * eine Spielerliste mit Ping und serverseitiges Kick/Bann.
 */
export const minecraftTemplate: GameTemplate = {
  id: 'minecraft',
  label: 'Minecraft',
  summary: 'Java Edition mit Paper, Vanilla, Fabric oder Forge. Volle Konsole über RCON, Plugin-Verwaltung und Hot-Backups.',
  image: 'itzg/minecraft-server',
  defaultTag: 'java21',
  defaultMemoryMb: 6144,
  defaultCpus: 4,
  notes: [
    'Mit dem Anlegen wird die Minecraft-EULA akzeptiert (EULA=TRUE).',
    'Das RCON-Passwort wird automatisch erzeugt und nicht auf den Host veröffentlicht.',
  ],
  capabilities: {
    console: 'rcon',
    players: 'rcon',
    mods: 'plugins',
    moderation: true,
  },
  ports: [
    { name: 'game', label: 'Spielport', container: 25565, protocol: 'tcp', defaultHost: 25565, internalOnly: false },
    { name: 'rcon', label: 'RCON', container: 25575, protocol: 'tcp', defaultHost: 25575, internalOnly: true },
  ],
  volumes: [{ name: 'data', containerPath: '/data', role: 'data' }],
  fields: [
    {
      id: 'serverName', label: 'Servername', type: 'text', default: 'Minecraft Server',
      required: true, maxLength: 48, editable: true, restartRequired: true, secret: false,
    },
    {
      id: 'motd', label: 'MOTD', type: 'text', default: 'Willkommen',
      required: false, maxLength: 59, editable: true, restartRequired: true, secret: false,
      help: 'Text in der Serverliste des Spiels.',
    },
    {
      id: 'type', label: 'Servertyp', type: 'select', default: 'PAPER',
      options: [
        { value: 'PAPER', label: 'Paper (empfohlen)' },
        { value: 'VANILLA', label: 'Vanilla' },
        { value: 'FABRIC', label: 'Fabric' },
        { value: 'FORGE', label: 'Forge' },
        { value: 'PURPUR', label: 'Purpur' },
      ],
      required: true, editable: true, restartRequired: true, secret: false,
    },
    {
      id: 'version', label: 'Minecraft-Version', type: 'text', default: 'LATEST',
      required: true, maxLength: 20, editable: true, restartRequired: true, secret: false,
      help: 'Konkrete Version wie 1.21.4 oder LATEST.',
    },
    {
      id: 'maxPlayers', label: 'Slots', type: 'number', default: 20,
      min: 1, max: 200, required: true, editable: true, restartRequired: true, secret: false,
    },
    {
      id: 'difficulty', label: 'Schwierigkeit', type: 'select', default: 'normal',
      options: [
        { value: 'peaceful', label: 'friedlich' },
        { value: 'easy', label: 'einfach' },
        { value: 'normal', label: 'normal' },
        { value: 'hard', label: 'hart' },
      ],
      required: true, editable: true, restartRequired: true, secret: false,
    },
    {
      id: 'levelName', label: 'Welt', type: 'text', default: 'world',
      required: true, maxLength: 40, editable: false, restartRequired: true, secret: false,
      help: 'Verzeichnisname der Welt — nach dem Anlegen nicht mehr änderbar.',
    },
    {
      id: 'seed', label: 'Seed', type: 'text', default: '',
      required: false, maxLength: 40, editable: false, restartRequired: true, secret: false,
      help: 'Leer lassen für eine zufällige Welt.',
    },
    {
      id: 'whitelist', label: 'Whitelist', type: 'boolean', default: false,
      required: false, editable: true, restartRequired: true, secret: false,
    },
    {
      id: 'pvp', label: 'PvP', type: 'boolean', default: true,
      required: false, editable: true, restartRequired: true, secret: false,
    },
    {
      id: 'onlineMode', label: 'Online-Modus', type: 'boolean', default: true,
      required: false, editable: true, restartRequired: true, secret: false,
      help: 'Prüft Mojang-Konten. Nur für abgeschottete Netze abschalten.',
    },
    {
      id: 'viewDistance', label: 'Sichtweite', type: 'number', default: 10,
      min: 3, max: 32, required: true, editable: true, restartRequired: true, secret: false,
      help: 'In Chunks. Höhere Werte kosten spürbar CPU und RAM.',
    },
  ],

  env(values, ctx) {
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
      SERVER_PORT: String(ctx.hostPorts.game ?? 25565),
      TZ: ctx.timezone,
      // Der Container darf sich nicht selbst abschalten, wenn kurz niemand spielt.
      ENABLE_AUTOPAUSE: 'FALSE',
      // Startet den Server neu, statt den Container zu beenden — das Panel steuert den Lebenszyklus.
      STOP_SERVER_ANNOUNCE_DELAY: '5',
    };
    if (seed) env.SEED = seed;
    if (ctx.rconPassword) env.RCON_PASSWORD = ctx.rconPassword;
    return env;
  },

  logPatterns: {
    // `[12:34:56] [Server thread/INFO]: Kai_Baut[/1.2.3.4:5678] logged in with entity id ...`
    join: /:\s*([A-Za-z0-9_]{1,16})\[\/[^\]]+\] logged in/,
    // `[Server thread/INFO]: Kai_Baut lost connection: Disconnected`
    leave: /:\s*([A-Za-z0-9_]{1,16}) lost connection/,
    ready: /\]: Done \([\d.]+s\)! For help/,
    level: levelFromKeywords,
    // Entfernt `[12:34:56] [Server thread/INFO]: ` — der Zeitstempel steht im Design in eigener Spalte.
    clean: (line) => line.replace(/^\[\d{2}:\d{2}:\d{2}\]\s*\[[^\]]+\]:\s*/, '').trimEnd(),
  },

  modsPath: '/data/plugins',
  modExtensions: ['.jar'],

  backup: {
    paths: ['/data'],
    // Erst Schreibvorgänge anhalten und die Welt auf Platte zwingen, dann sichern.
    preCommands: ['save-off', 'save-all flush'],
    postCommands: ['save-on'],
  },
};

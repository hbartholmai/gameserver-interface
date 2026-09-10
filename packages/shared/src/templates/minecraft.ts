import type { TemplateDefinition } from '../schema/template-definition.js';

/**
 * Minecraft auf Basis von `itzg/minecraft-server` — die Vorlage mit dem
 * größten Funktionsumfang: RCON gibt eine echte bidirektionale Konsole,
 * eine Spielerliste mit Ping und serverseitiges Kick/Bann.
 */
export const minecraftDefinition: TemplateDefinition = {
  id: 'minecraft',
  label: 'Minecraft',
  summary: 'Java Edition mit Paper, Vanilla, Fabric oder Forge. Volle Konsole über RCON, Plugin-Verwaltung und Hot-Backups.',
  image: 'itzg/minecraft-server',
  // `VERSION: LATEST` holt die neueste Paper-Ausgabe, und die verlangt seit
  // Minecraft 26.1 Java 25 — mit `java21` bricht der Server beim Start ab
  // („Minecraft 26.1 and newer requires running the server with Java 25“).
  // Die Java-Version muss also mitwachsen, solange die Vorgabe LATEST ist.
  defaultTag: 'java25',
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

  env: [
    { name: 'EULA', source: { kind: 'const', value: 'TRUE' }, trim: false, omitWhenEmpty: false },
    { name: 'TYPE', source: { kind: 'field', field: 'type' }, fallback: 'PAPER', trim: false, omitWhenEmpty: false },
    { name: 'VERSION', source: { kind: 'field', field: 'version' }, fallback: 'LATEST', trim: false, omitWhenEmpty: false },
    { name: 'MOTD', source: { kind: 'field', field: 'motd' }, fallback: '', trim: false, omitWhenEmpty: false },
    { name: 'MAX_PLAYERS', source: { kind: 'field', field: 'maxPlayers' }, fallback: '20', trim: false, omitWhenEmpty: false },
    { name: 'DIFFICULTY', source: { kind: 'field', field: 'difficulty' }, fallback: 'normal', trim: false, omitWhenEmpty: false },
    { name: 'LEVEL', source: { kind: 'field', field: 'levelName' }, fallback: 'world', trim: false, omitWhenEmpty: false },
    {
      name: 'ENABLE_WHITELIST', source: { kind: 'field', field: 'whitelist' },
      boolean: { whenTrue: 'TRUE', whenFalse: 'FALSE' }, fallback: 'FALSE', trim: false, omitWhenEmpty: false,
    },
    {
      name: 'PVP', source: { kind: 'field', field: 'pvp' },
      boolean: { whenTrue: 'TRUE', whenFalse: 'FALSE' }, fallback: 'TRUE', trim: false, omitWhenEmpty: false,
    },
    {
      name: 'ONLINE_MODE', source: { kind: 'field', field: 'onlineMode' },
      boolean: { whenTrue: 'TRUE', whenFalse: 'FALSE' }, fallback: 'TRUE', trim: false, omitWhenEmpty: false,
    },
    { name: 'VIEW_DISTANCE', source: { kind: 'field', field: 'viewDistance' }, fallback: '10', trim: false, omitWhenEmpty: false },
    { name: 'ENABLE_RCON', source: { kind: 'const', value: 'TRUE' }, trim: false, omitWhenEmpty: false },
    { name: 'RCON_PORT', source: { kind: 'const', value: '25575' }, trim: false, omitWhenEmpty: false },
    { name: 'SERVER_PORT', source: { kind: 'port', port: 'game' }, fallback: '25565', trim: false, omitWhenEmpty: false },
    { name: 'TZ', source: { kind: 'timezone' }, trim: false, omitWhenEmpty: false },
    // Der Container darf sich nicht selbst abschalten, wenn kurz niemand spielt.
    { name: 'ENABLE_AUTOPAUSE', source: { kind: 'const', value: 'FALSE' }, trim: false, omitWhenEmpty: false },
    // Startet den Server neu, statt den Container zu beenden — das Panel steuert den Lebenszyklus.
    { name: 'STOP_SERVER_ANNOUNCE_DELAY', source: { kind: 'const', value: '5' }, trim: false, omitWhenEmpty: false },
    // Leerer Seed bedeutet Zufallswelt; die Variable darf dann nicht gesetzt sein.
    { name: 'SEED', source: { kind: 'field', field: 'seed' }, trim: true, omitWhenEmpty: true },
    { name: 'RCON_PASSWORD', source: { kind: 'rconPassword' }, trim: false, omitWhenEmpty: true },
  ],

  logPatterns: {
    // `[12:34:56] [Server thread/INFO]: Kai_Baut[/1.2.3.4:5678] logged in with entity id ...`
    join: { source: ':\\s*([A-Za-z0-9_]{1,16})\\[\\/[^\\]]+\\] logged in', flags: '' },
    // `[Server thread/INFO]: Kai_Baut lost connection: Disconnected`
    leave: { source: ':\\s*([A-Za-z0-9_]{1,16}) lost connection', flags: '' },
    ready: { source: '\\]: Done \\([\\d.]+s\\)! For help', flags: '' },
    // Entfernt `[12:34:56] [Server thread/INFO]: ` — der Zeitstempel steht im Design in eigener Spalte.
    clean: {
      pattern: { source: '^\\[\\d{2}:\\d{2}:\\d{2}\\]\\s*\\[[^\\]]+\\]:\\s*', flags: '' },
      replacement: '',
    },
  },

  validations: [
    {
      rule: 'pattern',
      field: 'levelName',
      pattern: { source: '^[A-Za-z0-9_.-]+$', flags: '' },
      message: 'Nur Buchstaben, Ziffern und . _ -',
      onlyWhenSet: true,
    },
  ],

  adapter: { maxPlayersField: 'maxPlayers' },

  fakeLog: {
    timeFormat: 'hms',
    join: '[{time}] [Server thread/INFO]: {name}[/84.61.12.4:52{n}] logged in with entity id {n}',
    leave: '[{time}] [Server thread/INFO]: {name} lost connection: Disconnected',
    ready: '[{time}] [Server thread/INFO]: Done (12.000s)! For help, type "help"',
    chatter: '[{time}] [Server thread/INFO]: Saved the game ({n} ms)',
  },

  modsPath: '/data/plugins',
  modExtensions: ['.jar'],

  /*
   * Paper und Spigot legen die Dimensionen als **Geschwister** an: `welt`,
   * `welt_nether`, `welt_the_end`. Wer nur `welt/` mitnimmt, verliert Nether
   * und End, ohne dass es auffällt. Vanilla legt sie stattdessen als `DIM-1`
   * und `DIM1` **in** die Welt — dort reisen sie ohnehin mit.
   */
  world: {
    parent: '/data',
    name: { kind: 'field', field: 'levelName' },
    parts: [
      { suffix: '', type: 'dir', required: true },
      { suffix: '_nether', type: 'dir', required: false },
      { suffix: '_the_end', type: 'dir', required: false },
    ],
    markers: ['level.dat'],
    accept: [],
  },

  backup: {
    paths: ['/data'],
    // Erst Schreibvorgänge anhalten und die Welt auf Platte zwingen, dann sichern.
    preCommands: ['save-off', 'save-all flush'],
    postCommands: ['save-on'],
  },
};

import type { TemplateDefinition } from '../schema/template-definition.js';

/**
 * Terraria auf Basis von `ryshe/terraria`.
 *
 * Das Image bringt **TShock** mit — eine Servererweiterung, die Plugins,
 * Rechteverwaltung und eine REST-Schnittstelle hinzufügt. Deshalb liegen die
 * Plugins unter `/plugins` und die Protokolle unter `/tshock/logs`.
 *
 * TShock spricht kein RCON, sondern eine eigene REST-Schnittstelle mit Token.
 * Das Panel unterstützt die nicht, die Konsole ist also nur lesend; Spielernamen
 * kommen aus den `Broadcast:`-Zeilen des Logs.
 *
 * Die Welt entsteht **nicht** von selbst: Ohne vorhandene `.wld`-Datei bleibt
 * der Server im interaktiven Einrichtungsdialog stehen. Deshalb legt die
 * Vorlage über `-autocreate` eine an.
 */
export const terrariaDefinition: TemplateDefinition = {
  id: 'terraria',
  label: 'Terraria',
  summary: 'Terraria-Server mit TShock: Plugin-Verwaltung und Rechtesystem. Konsole nur lesend.',
  image: 'ryshe/terraria',
  defaultTag: 'latest',
  defaultMemoryMb: 2048,
  defaultCpus: 2,
  notes: [
    'Das Image bringt TShock mit; Plugins liegen im Mod-Reiter unter /plugins.',
    'TShock bietet kein RCON, sondern eine REST-Schnittstelle — die Konsole ist nur lesend.',
    'Beim ersten Start wird eine Welt erzeugt. Das dauert je nach Größe einige Minuten.',
  ],
  capabilities: {
    console: 'readonly',
    players: 'log',
    mods: 'plugins',
    moderation: false,
  },
  ports: [
    { name: 'game', label: 'Spielport', container: 7777, protocol: 'tcp', defaultHost: 7777, internalOnly: false },
  ],
  volumes: [
    { name: 'worlds', containerPath: '/root/.local/share/Terraria/Worlds', role: 'data' },
    { name: 'plugins', containerPath: '/plugins', role: 'mods' },
    { name: 'logs', containerPath: '/tshock/logs', role: 'config' },
  ],
  fields: [
    {
      id: 'worldName', label: 'Welt', type: 'text', default: 'welt',
      required: true, maxLength: 40, editable: false, restartRequired: true, secret: false,
      help: 'Dateiname ohne .wld — nach dem Anlegen nicht mehr änderbar.',
    },
    {
      // `-world` erwartet den vollständigen Pfad, `WORLD_FILENAME` nur den Namen.
      // Beides muss zusammenpassen, deshalb steht der Pfad als eigenes,
      // unsichtbar vorbelegtes Feld hier.
      id: 'worldPfad', label: 'Pfad der Weltdatei', type: 'text',
      default: '/root/.local/share/Terraria/Worlds/welt.wld',
      required: true, maxLength: 200, editable: false, restartRequired: true, secret: false,
      help: 'Wird aus dem Weltnamen gebildet; nur ändern, wenn eine vorhandene Datei anders heißt.',
    },
    {
      id: 'worldSize', label: 'Weltgröße', type: 'select', default: '2',
      options: [
        { value: '1', label: 'klein' },
        { value: '2', label: 'mittel' },
        { value: '3', label: 'groß' },
      ],
      required: true, editable: false, restartRequired: true, secret: false,
      help: 'Gilt nur beim Erzeugen der Welt.',
    },
    {
      id: 'difficulty', label: 'Weltmodus', type: 'select', default: '0',
      options: [
        { value: '0', label: 'klassisch' },
        { value: '1', label: 'Experte' },
        { value: '2', label: 'Meister' },
        { value: '3', label: 'Reise' },
      ],
      required: true, editable: false, restartRequired: true, secret: false,
    },
    {
      id: 'maxPlayers', label: 'Slots', type: 'number', default: 8,
      min: 1, max: 255, required: true, editable: true, restartRequired: true, secret: false,
    },
    {
      id: 'password', label: 'Serverpasswort', type: 'password', default: '',
      required: false, maxLength: 64, editable: true, restartRequired: true, secret: true,
      help: 'Leer lassen für einen offenen Server.',
    },
  ],

  /*
   * Das Image kennt genau zwei Umgebungsvariablen — `WORLD_FILENAME` und
   * `CONFIG_FILENAME`. Alles Weitere erwartet der Terraria-Server als
   * Startargument; deshalb steht unten `args` statt weiterer Env-Einträge.
   */
  env: [
    { name: 'WORLD_FILENAME', source: { kind: 'field', field: 'worldName' }, fallback: 'welt', trim: true, omitWhenEmpty: false },
    { name: 'TZ', source: { kind: 'timezone' }, trim: false, omitWhenEmpty: false },
  ],

  args: [
    // Ohne `-world` und `-autocreate` bleibt der Server beim ersten Start im
    // interaktiven Einrichtungsdialog stehen und erreicht nie „Online“.
    { flag: '-world', source: { kind: 'field', field: 'worldPfad' }, trim: true, omitWhenEmpty: false },
    { flag: '-autocreate', source: { kind: 'field', field: 'worldSize' }, fallback: '2', trim: false, omitWhenEmpty: false },
    { flag: '-difficulty', source: { kind: 'field', field: 'difficulty' }, fallback: '0', trim: false, omitWhenEmpty: false },
    { flag: '-maxplayers', source: { kind: 'field', field: 'maxPlayers' }, fallback: '8', trim: false, omitWhenEmpty: false },
    { flag: '-port', source: { kind: 'port', port: 'game' }, fallback: '7777', trim: false, omitWhenEmpty: false },
    // Ohne Passwort entfällt das Argument samt Flag.
    { flag: '-password', source: { kind: 'field', field: 'password' }, trim: false, omitWhenEmpty: true },
  ],

  logPatterns: {
    // TShock meldet Beitritt und Abgang als Rundnachricht:
    // `Broadcast: Kai has joined.`
    join: { source: 'Broadcast: (.+?) has joined\\.', flags: '' },
    leave: { source: 'Broadcast: (.+?) has left\\.', flags: '' },
    ready: { source: '(Server started|Listening on port)', flags: 'i' },
    clean: {
      pattern: { source: '^\\s*\\[?\\d{2}:\\d{2}:\\d{2}\\]?\\s*', flags: '' },
      replacement: '',
    },
  },

  validations: [
    {
      rule: 'pattern',
      field: 'worldName',
      pattern: { source: '^[A-Za-z0-9_.-]+$', flags: '' },
      message: 'Nur Buchstaben, Ziffern und . _ -',
      onlyWhenSet: true,
    },
  ],

  adapter: { maxPlayersField: 'maxPlayers' },

  fakeLog: {
    timeFormat: 'hms',
    join: '[{time}] Broadcast: {name} has joined.',
    leave: '[{time}] Broadcast: {name} has left.',
    ready: '[{time}] Server started',
    chatter: '[{time}] Saving world data ({n} ms)',
  },

  modsPath: '/plugins',
  modExtensions: ['.dll'],

  backup: {
    paths: ['/root/.local/share/Terraria/Worlds'],
    preCommands: [],
    postCommands: [],
  },
};

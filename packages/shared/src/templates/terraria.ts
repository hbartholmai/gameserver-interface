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
      help: 'Dateiname der Welt im Datenverzeichnis, genau wie sie dort heißt — das Image hängt keine Endung an. Nach dem Anlegen nicht mehr änderbar.',
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
    /*
     * **Kein `-world` hier.** Das Image hat einen ENTRYPOINT, kein CMD — die
     * Argumente ersetzen also nichts, sie werden an `bootstrap.sh` angehängt.
     * Und das Skript baut aus `WORLD_FILENAME` bereits selbst ein `-world`:
     *
     *   WORLD_PATH="/root/.local/share/Terraria/Worlds/$WORLD_FILENAME"
     *   ./TShock.Server -configpath … -logpath … -world "$WORLD_PATH" "$@"
     *
     * Ein zweites `-world` bricht TShock beim Start ab, noch vor der ersten
     * eigenen Logzeile: „An item with the same key has already been added.
     * Key: -world“.
     *
     * `-autocreate` bleibt: ohne die Welt stünde der Server im interaktiven
     * Einrichtungsdialog, und das Skript prüft das Flag ausdrücklich, bevor es
     * eine fehlende Weltdatei überhaupt hinnimmt.
     */
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

  /*
   * `bootstrap.sh` bildet den Pfad als `Worlds/$WORLD_FILENAME` — ohne Endung.
   * Auf der Platte heißt die Datei also `welt`, während der Benutzer eine
   * `.wld` in der Hand hält; `accept` schließt die Lücke in beide Richtungen.
   *
   * Die `.twld` daneben gehört TShock: Regionen und Rechte. Sie reist mit,
   * kostet aber die rohe Einzeldatei — sobald sie existiert, wird der Download
   * ein ZIP.
   */
  world: {
    parent: '/root/.local/share/Terraria/Worlds',
    name: { kind: 'field', field: 'worldName' },
    parts: [
      { suffix: '', type: 'file', required: true },
      { suffix: '.twld', type: 'file', required: false },
    ],
    markers: [],
    accept: ['.wld'],
  },

  backup: {
    paths: ['/root/.local/share/Terraria/Worlds'],
    preCommands: [],
    postCommands: [],
  },
};

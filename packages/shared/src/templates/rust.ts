import type { TemplateDefinition } from '../schema/template-definition.js';

/**
 * Rust auf Basis von `didstopia/rust-server`.
 *
 * **Rusts RCON ist kein Source-RCON.** Es läuft als WebSocket über HTTP; der
 * RCON-Client des Panels spricht das nicht. Deshalb `console: 'readonly'` und
 * ein eigenes Passwortfeld statt des erzeugten Geheimnisses — der Betreiber
 * braucht das Passwort ohnehin für seinen eigenen Web-RCON-Client, und den
 * Port veröffentlichen wir dafür.
 *
 * Mods laufen über Oxide/uMod: Plugins sind `.cs`-Dateien unter
 * `oxide/plugins`. Das Image installiert Oxide auf Wunsch selbst.
 */
export const rustDefinition: TemplateDefinition = {
  id: 'rust',
  label: 'Rust',
  summary: 'Survival-Server mit Oxide-Plugins. Konsole nur lesend — Rust spricht Web-RCON.',
  image: 'didstopia/rust-server',
  defaultTag: 'latest',
  // Die Doku des Images nennt 4 GB als Untergrenze, ab der der Server nicht
  // mehr von selbst aussteigt. Eine große Karte braucht deutlich mehr.
  defaultMemoryMb: 8192,
  defaultCpus: 4,
  notes: [
    'Rust spricht Web-RCON über WebSocket; die Konsole im Panel bleibt deshalb lesend. Zum Steuern einen Web-RCON-Client auf den RCON-Port richten.',
    'Die Kartengröße bestimmt den Speicherbedarf: unter 4 GB steigt der Server von selbst aus.',
    'Seed und Kartengröße zusammen ergeben die Welt. Wer eines von beidem ändert, bekommt eine neue Karte.',
    'Oxide-Plugins sind .cs-Dateien; das Image installiert Oxide auf Wunsch beim Start.',
  ],
  capabilities: {
    console: 'readonly',
    players: 'a2s',
    mods: 'plugins',
    moderation: false,
  },
  ports: [
    { name: 'game', label: 'Spielport', container: 28015, protocol: 'udp', defaultHost: 28015, internalOnly: false },
    { name: 'query', label: 'Steam-Abfrage', container: 28016, protocol: 'udp', defaultHost: 28016, internalOnly: false },
    { name: 'rconweb', label: 'Web-RCON', container: 28016, protocol: 'tcp', defaultHost: 28016, internalOnly: false },
    { name: 'app', label: 'Rust+ Begleit-App', container: 28082, protocol: 'tcp', defaultHost: 28082, internalOnly: false },
  ],
  volumes: [{ name: 'rust', containerPath: '/steamcmd/rust', role: 'data' }],
  fields: [
    {
      id: 'serverName', label: 'Servername', type: 'text', default: 'Rust-Server',
      required: true, maxLength: 64, editable: true, restartRequired: true, secret: false,
    },
    {
      id: 'description', label: 'Beschreibung', type: 'text', default: '',
      required: false, maxLength: 250, editable: true, restartRequired: true, secret: false,
    },
    {
      id: 'url', label: 'Webseite', type: 'text', default: '',
      required: false, maxLength: 200, editable: true, restartRequired: true, secret: false,
      help: 'Wird im Serverbrowser verlinkt.',
    },
    {
      id: 'maxPlayers', label: 'Slots', type: 'number', default: 100,
      min: 1, max: 500, required: true, editable: true, restartRequired: true, secret: false,
    },
    {
      id: 'identity', label: 'Kennung des Spielstands', type: 'text', default: 'docker',
      required: true, maxLength: 32, editable: true, restartRequired: true, secret: false,
      help: 'Name des Verzeichnisses, in dem der Spielstand liegt. Ein Wechsel startet eine neue Welt.',
    },
    {
      id: 'seed', label: 'Karten-Seed', type: 'number', default: 12345,
      min: 1, max: 2147483647, required: true, editable: true, restartRequired: true, secret: false,
    },
    {
      id: 'worldSize', label: 'Kartengröße', type: 'number', default: 3500,
      min: 1000, max: 6000, required: true, editable: true, restartRequired: true, secret: false,
      help: 'Kantenlänge in Metern. Mehr Karte heißt mehr Arbeitsspeicher.',
    },
    {
      id: 'saveInterval', label: 'Speicherabstand (s)', type: 'number', default: 600,
      min: 60, max: 3600, required: true, editable: true, restartRequired: true, secret: false,
    },
    {
      id: 'rconPassword', label: 'RCON-Passwort', type: 'password', default: '',
      required: true, maxLength: 64, editable: true, restartRequired: true, secret: true,
      help: 'Für den Web-RCON-Zugang. Das Image setzt sonst „docker“ als Passwort.',
    },
    {
      id: 'oxide', label: 'Oxide installieren', type: 'boolean', default: false,
      required: false, editable: true, restartRequired: true, secret: false,
      help: 'Nötig für Plugins. Das Image holt die jeweils neueste Fassung.',
    },
  ],

  env: [
    { name: 'RUST_SERVER_NAME', source: { kind: 'field', field: 'serverName' }, trim: true, omitWhenEmpty: false },
    { name: 'RUST_SERVER_DESCRIPTION', source: { kind: 'field', field: 'description' }, trim: true, omitWhenEmpty: true },
    { name: 'RUST_SERVER_URL', source: { kind: 'field', field: 'url' }, trim: true, omitWhenEmpty: true },
    { name: 'RUST_SERVER_MAXPLAYERS', source: { kind: 'field', field: 'maxPlayers' }, fallback: '100', trim: false, omitWhenEmpty: false },
    { name: 'RUST_SERVER_IDENTITY', source: { kind: 'field', field: 'identity' }, trim: true, omitWhenEmpty: false },
    { name: 'RUST_SERVER_SEED', source: { kind: 'field', field: 'seed' }, fallback: '12345', trim: false, omitWhenEmpty: false },
    { name: 'RUST_SERVER_WORLDSIZE', source: { kind: 'field', field: 'worldSize' }, fallback: '3500', trim: false, omitWhenEmpty: false },
    { name: 'RUST_SERVER_SAVE_INTERVAL', source: { kind: 'field', field: 'saveInterval' }, fallback: '600', trim: false, omitWhenEmpty: false },
    { name: 'RUST_RCON_PASSWORD', source: { kind: 'field', field: 'rconPassword' }, trim: false, omitWhenEmpty: false },
    {
      name: 'RUST_OXIDE_ENABLED', source: { kind: 'field', field: 'oxide' },
      boolean: { whenTrue: '1', whenFalse: '0' }, trim: false, omitWhenEmpty: false,
    },
    { name: 'RUST_SERVER_PORT', source: { kind: 'port', port: 'game' }, fallback: '28015', trim: false, omitWhenEmpty: false },
    { name: 'RUST_SERVER_QUERYPORT', source: { kind: 'port', port: 'query' }, fallback: '28016', trim: false, omitWhenEmpty: false },
    { name: 'RUST_RCON_PORT', source: { kind: 'port', port: 'rconweb' }, fallback: '28016', trim: false, omitWhenEmpty: false },
    { name: 'RUST_APP_PORT', source: { kind: 'port', port: 'app' }, fallback: '28082', trim: false, omitWhenEmpty: false },
    { name: 'RUST_RCON_WEB', source: { kind: 'const', value: '1' }, trim: false, omitWhenEmpty: false },
    { name: 'TZ', source: { kind: 'timezone' }, trim: false, omitWhenEmpty: false },
  ],

  /*
   * Die Serverkonsole meldet Verbindungen als
   * `10.0.0.5:52345/76561198000000000/Kai joined [windows/76561198000000000]`
   * und Abgänge als `… /Kai disconnecting: disconnect`. Der Name steht in
   * beiden Fällen hinter der Steam-Kennung.
   */
  logPatterns: {
    join: { source: '^\\S+/\\d+/(.+?) joined ', flags: '' },
    leave: { source: '^\\S+/\\d+/(.+?) disconnecting', flags: '' },
    ready: { source: '(Server startup complete|SteamServer Initialized)', flags: '' },
  },

  validations: [
    {
      rule: 'minLength', field: 'rconPassword', value: 8,
      message: 'Mindestens 8 Zeichen', onlyWhenSet: false,
    },
  ],

  adapter: { queryPortName: 'query', maxPlayersField: 'maxPlayers' },

  fakeLog: {
    timeFormat: 'iso',
    join: '10.0.0.5:{n}/76561198000000000/{name} joined [windows/76561198000000000]',
    leave: '10.0.0.5:{n}/76561198000000000/{name} disconnecting: disconnect',
    ready: 'Server startup complete',
    chatter: 'Saving complete ({n} entities)',
  },

  modsPath: '/steamcmd/rust/oxide/plugins',
  modExtensions: ['.cs'],

  backup: {
    // Der Spielstand liegt unter der gewählten Kennung; das Verzeichnis
    // `server` enthält alle Kennungen samt Konfiguration.
    paths: ['/steamcmd/rust/server'],
    preCommands: [],
    postCommands: [],
  },
};

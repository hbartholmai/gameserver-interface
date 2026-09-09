import type { TemplateDefinition } from '../schema/template-definition.js';

/**
 * Project Zomboid auf Basis von `renegademaster/zomboid-dedicated-server`.
 *
 * Zwei Volumes mit verschiedenen Aufgaben: die Installation liegt unter
 * `ZomboidDedicatedServer` und wird bei jedem Start überprüft, die
 * Konfiguration samt Spielständen unter `Zomboid`. Gesichert wird nur das
 * zweite.
 *
 * **Kick und Bann bleiben aus.** Der Server kennt sie über RCON, aber als
 * `kickuser` und `banuser` — der Adapter des Panels schickt die
 * Minecraft-Schreibweise. Über die Konsole geht beides von Hand.
 */
export const zomboidDefinition: TemplateDefinition = {
  id: 'zomboid',
  label: 'Project Zomboid',
  summary: 'Isometrisches Zombie-Survival mit RCON-Konsole und Werkstatt-Mods.',
  image: 'renegademaster/zomboid-dedicated-server',
  defaultTag: 'latest',
  // Der Server läuft auf der JVM; die Speichergrenze wird zusätzlich als
  // MAX_RAM gesetzt und sollte unter der Grenze der Instanz liegen.
  defaultMemoryMb: 6144,
  defaultCpus: 2,
  notes: [
    'Die Java-Speichergrenze wird getrennt gesetzt und sollte unter dem Speicherlimit der Instanz liegen — sonst beendet Docker den Server mitten im Speichern.',
    'Kick und Bann laufen über die Konsole: „kickuser <Name>“ und „banuser <Name>“.',
    'Mods brauchen beides: die Werkstatt-Kennung zum Herunterladen und den Mod-Namen zum Laden.',
    'Der erste Start erzeugt die Konfiguration; danach lässt sie sich im Volume „config“ von Hand feinjustieren.',
  ],
  capabilities: {
    console: 'rcon',
    players: 'log',
    mods: 'none',
    moderation: false,
  },
  ports: [
    { name: 'game', label: 'Spielport', container: 16261, protocol: 'udp', defaultHost: 16261, internalOnly: false },
    { name: 'udp', label: 'Zusatzport', container: 16262, protocol: 'udp', defaultHost: 16262, internalOnly: false },
    { name: 'rcon', label: 'RCON', container: 27015, protocol: 'tcp', defaultHost: 27015, internalOnly: true },
  ],
  volumes: [
    { name: 'server', containerPath: '/home/steam/ZomboidDedicatedServer', role: 'data' },
    { name: 'config', containerPath: '/home/steam/Zomboid', role: 'config' },
  ],
  fields: [
    {
      id: 'serverName', label: 'Servername', type: 'text', default: 'ZomboidServer',
      required: true, maxLength: 64, editable: true, restartRequired: true, secret: false,
    },
    {
      id: 'adminUsername', label: 'Adminkonto', type: 'text', default: 'superuser',
      required: true, maxLength: 32, editable: true, restartRequired: true, secret: false,
    },
    {
      id: 'adminPassword', label: 'Adminpasswort', type: 'password', default: '',
      required: true, maxLength: 64, editable: true, restartRequired: true, secret: true,
      help: 'Für das Adminmenü im Spiel. Nur Buchstaben und Ziffern.',
    },
    {
      id: 'serverPassword', label: 'Serverpasswort', type: 'password', default: '',
      required: false, maxLength: 64, editable: true, restartRequired: true, secret: true,
      help: 'Leer lassen für einen offenen Server.',
    },
    {
      id: 'maxPlayers', label: 'Slots', type: 'number', default: 16,
      min: 1, max: 100, required: true, editable: true, restartRequired: true, secret: false,
    },
    {
      id: 'maxRam', label: 'Java-Speicher', type: 'text', default: '4096m',
      required: true, maxLength: 8, editable: true, restartRequired: true, secret: false,
      help: 'Zahl mit angehängtem m, etwa 4096m. Muss unter dem Speicherlimit der Instanz bleiben.',
    },
    {
      id: 'mapNames', label: 'Karten', type: 'text', default: 'Muldraugh, KY',
      required: true, maxLength: 200, editable: true, restartRequired: true, secret: false,
      help: 'Mehrere Karten mit Semikolon trennen.',
    },
    {
      id: 'modNames', label: 'Mod-Namen', type: 'text', default: '',
      required: false, maxLength: 500, editable: true, restartRequired: true, secret: false,
      help: 'Namen der zu ladenden Mods, mit Semikolon getrennt.',
    },
    {
      id: 'modIds', label: 'Werkstatt-Kennungen', type: 'text', default: '',
      required: false, maxLength: 500, editable: true, restartRequired: true, secret: false,
      help: 'Kennungen der herunterzuladenden Werkstatt-Einträge, mit Semikolon getrennt.',
    },
    {
      id: 'autosave', label: 'Speicherabstand (min)', type: 'number', default: 15,
      min: 1, max: 120, required: true, editable: true, restartRequired: true, secret: false,
    },
    {
      id: 'publicServer', label: 'Öffentlich', type: 'boolean', default: true,
      required: false, editable: true, restartRequired: true, secret: false,
      help: 'Aus: nur vorab freigegebene Spieler kommen herein.',
    },
    {
      id: 'pauseOnEmpty', label: 'Pausieren, wenn leer', type: 'boolean', default: true,
      required: false, editable: true, restartRequired: true, secret: false,
      help: 'Spart Rechenzeit, hält aber auch die Spielzeit an.',
    },
    {
      id: 'steamVac', label: 'VAC einschalten', type: 'boolean', default: true,
      required: false, editable: true, restartRequired: true, secret: false,
    },
  ],

  env: [
    { name: 'SERVER_NAME', source: { kind: 'field', field: 'serverName' }, trim: true, omitWhenEmpty: false },
    { name: 'ADMIN_USERNAME', source: { kind: 'field', field: 'adminUsername' }, trim: true, omitWhenEmpty: false },
    { name: 'ADMIN_PASSWORD', source: { kind: 'field', field: 'adminPassword' }, trim: false, omitWhenEmpty: false },
    { name: 'SERVER_PASSWORD', source: { kind: 'field', field: 'serverPassword' }, trim: false, omitWhenEmpty: true },
    { name: 'MAX_PLAYERS', source: { kind: 'field', field: 'maxPlayers' }, fallback: '16', trim: false, omitWhenEmpty: false },
    { name: 'MAX_RAM', source: { kind: 'field', field: 'maxRam' }, trim: true, omitWhenEmpty: false },
    { name: 'MAP_NAMES', source: { kind: 'field', field: 'mapNames' }, trim: true, omitWhenEmpty: false },
    { name: 'MOD_NAMES', source: { kind: 'field', field: 'modNames' }, trim: true, omitWhenEmpty: true },
    { name: 'MOD_WORKSHOP_IDS', source: { kind: 'field', field: 'modIds' }, trim: true, omitWhenEmpty: true },
    { name: 'AUTOSAVE_INTERVAL', source: { kind: 'field', field: 'autosave' }, fallback: '15', trim: false, omitWhenEmpty: false },
    {
      name: 'PUBLIC_SERVER', source: { kind: 'field', field: 'publicServer' },
      boolean: { whenTrue: 'true', whenFalse: 'false' }, trim: false, omitWhenEmpty: false,
    },
    {
      name: 'PAUSE_ON_EMPTY', source: { kind: 'field', field: 'pauseOnEmpty' },
      boolean: { whenTrue: 'true', whenFalse: 'false' }, trim: false, omitWhenEmpty: false,
    },
    {
      name: 'STEAM_VAC', source: { kind: 'field', field: 'steamVac' },
      boolean: { whenTrue: 'true', whenFalse: 'false' }, trim: false, omitWhenEmpty: false,
    },
    { name: 'RCON_PASSWORD', source: { kind: 'rconPassword' }, trim: false, omitWhenEmpty: false },
    { name: 'RCON_PORT', source: { kind: 'const', value: '27015' }, trim: false, omitWhenEmpty: false },
    { name: 'DEFAULT_PORT', source: { kind: 'port', port: 'game' }, fallback: '16261', trim: false, omitWhenEmpty: false },
    { name: 'UDP_PORT', source: { kind: 'port', port: 'udp' }, fallback: '16262', trim: false, omitWhenEmpty: false },
    { name: 'BIND_IP', source: { kind: 'const', value: '0.0.0.0' }, trim: false, omitWhenEmpty: false },
    { name: 'TZ', source: { kind: 'timezone' }, trim: false, omitWhenEmpty: false },
  ],

  /*
   * Der Name steht in Anführungszeichen, davor ein Zeitstempel in eckigen
   * Klammern. Ob die Zeile „connected“ oder „fully connected“ sagt, hängt an
   * der Spielfassung — das Muster lässt beides zu.
   */
  logPatterns: {
    join: { source: '"([^"]+)" (?:fully )?connected', flags: '' },
    leave: { source: '"([^"]+)" (?:fully )?disconnected', flags: '' },
    ready: { source: 'SERVER STARTED', flags: '' },
    clean: { pattern: { source: '^\\[[\\d\\-/: .]+\\]\\s*>?\\s*', flags: '' }, replacement: '' },
  },

  validations: [
    {
      rule: 'pattern', field: 'maxRam',
      pattern: { source: '^[0-9]+m$', flags: '' },
      message: 'Zahl mit angehängtem m, etwa 4096m', onlyWhenSet: false,
    },
    {
      rule: 'pattern', field: 'adminPassword',
      pattern: { source: '^[A-Za-z0-9]+$', flags: '' },
      message: 'Nur Buchstaben und Ziffern — der Server lehnt anderes ab', onlyWhenSet: true,
    },
    {
      rule: 'minLength', field: 'adminPassword', value: 8,
      message: 'Mindestens 8 Zeichen', onlyWhenSet: false,
    },
  ],

  adapter: { rconPortName: 'rcon', maxPlayersField: 'maxPlayers' },

  fakeLog: {
    timeFormat: 'hms',
    join: '[{time}] Player "{name}" connected ({n} / 16 players)',
    leave: '[{time}] Player "{name}" disconnected ({n} / 16 players)',
    ready: '[{time}] *** SERVER STARTED ****',
    chatter: '[{time}] Saving world ({n} ms)',
  },

  modExtensions: [],

  backup: {
    paths: ['/home/steam/Zomboid/Saves'],
    // Der Server schreibt den Spielstand vor dem Sichern weg.
    preCommands: ['save'],
    postCommands: [],
  },
};

import type { TemplateDefinition } from '../schema/template-definition.js';

/**
 * Core Keeper auf Basis von `escaping/core-keeper-dedicated`.
 *
 * **Zwei Netzbetriebsarten.** Ohne Portangabe läuft der Server über Steams
 * Relais: Spieler treten mit der Spiel-Kennung bei, es muss kein Port offen
 * sein. Wird ein Port gesetzt, wechselt der Server auf Direktverbindung. Das
 * Panel verwaltet Ports — deshalb setzt diese Vorlage einen und arbeitet
 * damit im Direktmodus.
 *
 * **Kein Abgangsmuster.** Der Server nennt beim Trennen nur die Steam-Kennung,
 * keinen Namen; die Spielerliste wächst deshalb bis zum nächsten Neustart.
 * Beides ist im Logparser des Images nachzulesen.
 */
export const coreKeeperDefinition: TemplateDefinition = {
  id: 'corekeeper',
  label: 'Core Keeper',
  summary: 'Sandbox-Bergbau im Direktverbindungsmodus. Spieler bleiben bis zum Neustart in der Liste.',
  image: 'escaping/core-keeper-dedicated',
  defaultTag: 'latest',
  defaultMemoryMb: 4096,
  defaultCpus: 2,
  notes: [
    'Diese Vorlage setzt einen Port und schaltet den Server damit auf Direktverbindung — Spieler brauchen Adresse und Passwort statt einer Spiel-Kennung.',
    'Ohne gesetztes Passwort erzeugt der Server selbst eines; es steht dann im Log.',
    'Wer den Weltnamen oder den Seed ändert, bekommt eine neue Welt — der alte Spielstand bleibt unter seinem Index liegen.',
    'Der Server meldet beim Trennen keinen Namen; Spieler verschwinden erst mit dem nächsten Neustart aus der Liste.',
  ],
  capabilities: {
    console: 'readonly',
    players: 'log',
    mods: 'none',
    moderation: false,
  },
  ports: [
    { name: 'game', label: 'Spielport', container: 27015, protocol: 'udp', defaultHost: 27015, internalOnly: false },
  ],
  volumes: [
    { name: 'data', containerPath: '/home/steam/core-keeper-data', role: 'data' },
    { name: 'server', containerPath: '/home/steam/core-keeper-dedicated', role: 'config' },
  ],
  fields: [
    {
      id: 'worldName', label: 'Weltname', type: 'text', default: 'Core Keeper Server',
      required: true, maxLength: 64, editable: true, restartRequired: true, secret: false,
    },
    {
      id: 'worldIndex', label: 'Weltindex', type: 'number', default: 0,
      min: 0, max: 10, required: true, editable: true, restartRequired: true, secret: false,
      help: 'Welcher Spielstand geladen wird. Ein neuer Index beginnt eine neue Welt.',
    },
    {
      id: 'worldSeed', label: 'Seed', type: 'text', default: '',
      required: false, maxLength: 32, editable: true, restartRequired: true, secret: false,
      help: 'Leer lassen für einen zufälligen Seed. Wirkt nur bei einer neuen Welt.',
    },
    {
      id: 'worldMode', label: 'Weltmodus', type: 'select', default: '0',
      options: [
        { value: '0', label: 'Normal' },
        { value: '1', label: 'Schwer' },
        { value: '2', label: 'Kreativ' },
        { value: '4', label: 'Entspannt' },
      ],
      required: true, editable: true, restartRequired: true, secret: false,
    },
    {
      id: 'maxPlayers', label: 'Slots', type: 'number', default: 10,
      min: 1, max: 100, required: true, editable: true, restartRequired: true, secret: false,
    },
    {
      id: 'password', label: 'Beitrittspasswort', type: 'password', default: '',
      required: false, maxLength: 28, editable: true, restartRequired: true, secret: true,
      help: 'Höchstens 28 Zeichen. Ohne Angabe erzeugt der Server eines und schreibt es ins Log.',
    },
    {
      id: 'modsEnabled', label: 'Mod-Unterstützung', type: 'boolean', default: false,
      required: false, editable: true, restartRequired: true, secret: false,
      help: 'Nötig, damit die unten genannten mod.io-Mods geladen werden.',
    },
    {
      id: 'mods', label: 'Mods', type: 'text', default: '',
      required: false, maxLength: 500, editable: true, restartRequired: true, secret: false,
      help: 'Liste der mod.io-Mods, die beim Start installiert werden.',
    },
    {
      id: 'puid', label: 'Benutzer-ID', type: 'number', default: 1000,
      min: 1, max: 65535, required: true, editable: true, restartRequired: true, secret: false,
      help: 'Muss dem Eigentümer des Datenverzeichnisses auf dem Host entsprechen.',
    },
    {
      id: 'pgid', label: 'Gruppen-ID', type: 'number', default: 1000,
      min: 1, max: 65535, required: true, editable: true, restartRequired: true, secret: false,
    },
  ],

  env: [
    { name: 'WORLD_NAME', source: { kind: 'field', field: 'worldName' }, trim: true, omitWhenEmpty: false },
    { name: 'WORLD_INDEX', source: { kind: 'field', field: 'worldIndex' }, fallback: '0', trim: false, omitWhenEmpty: false },
    { name: 'WORLD_SEED', source: { kind: 'field', field: 'worldSeed' }, trim: true, omitWhenEmpty: true },
    { name: 'WORLD_MODE', source: { kind: 'field', field: 'worldMode' }, trim: false, omitWhenEmpty: false },
    { name: 'MAX_PLAYERS', source: { kind: 'field', field: 'maxPlayers' }, fallback: '10', trim: false, omitWhenEmpty: false },
    { name: 'PASSWORD', source: { kind: 'field', field: 'password' }, trim: false, omitWhenEmpty: true },
    // Der gesetzte Port ist es, der den Direktmodus einschaltet.
    { name: 'SERVER_PORT', source: { kind: 'port', port: 'game' }, fallback: '27015', trim: false, omitWhenEmpty: false },
    { name: 'SERVER_IP', source: { kind: 'const', value: '0.0.0.0' }, trim: false, omitWhenEmpty: false },
    {
      name: 'MODS_ENABLED', source: { kind: 'field', field: 'modsEnabled' },
      boolean: { whenTrue: 'true', whenFalse: 'false' }, trim: false, omitWhenEmpty: false,
    },
    { name: 'MODS', source: { kind: 'field', field: 'mods' }, trim: true, omitWhenEmpty: true },
    { name: 'PUID', source: { kind: 'field', field: 'puid' }, fallback: '1000', trim: false, omitWhenEmpty: false },
    { name: 'PGID', source: { kind: 'field', field: 'pgid' }, fallback: '1000', trim: false, omitWhenEmpty: false },
    { name: 'TZ', source: { kind: 'timezone' }, trim: false, omitWhenEmpty: false },
  ],

  /*
   * Belegt am Logparser des Images (`scripts/logfile-parser.sh`), der genau
   * diese Zeilen auswertet:
   * `[userid:76561198000000000] player Kai connected islocalplayer=False`
   * `Started session with info: …`
   * Beim Trennen steht dort nur `Disconnected from userid: … with reason …`.
   */
  logPatterns: {
    join: { source: '^\\[userid:\\d+\\] player (.+?) connected', flags: '' },
    ready: { source: 'Started session with info', flags: '' },
  },

  validations: [],

  adapter: { maxPlayersField: 'maxPlayers' },

  fakeLog: {
    timeFormat: 'iso',
    join: '[userid:7656119800000{n}] player {name} connected islocalplayer=False',
    leave: 'Disconnected from userid: 7656119800000{n} with reason ClosedByPeer ({name})',
    ready: 'Started session with info: world1',
    chatter: 'Saving world ({n} ms)',
  },

  modExtensions: [],

  backup: {
    paths: ['/home/steam/core-keeper-data'],
    preCommands: [],
    postCommands: [],
  },
};

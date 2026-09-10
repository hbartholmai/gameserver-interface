import type { TemplateDefinition } from '../schema/template-definition.js';

/**
 * V Rising auf Basis von `trueosiris/vrising` (der Windows-Server unter Wine).
 *
 * **Das Image reicht beliebige Einstellungen durch.** Variablen mit dem Präfix
 * `HOST_SETTINGS_` bzw. `GAME_SETTINGS_` landen in `ServerHostSettings.json`
 * und `ServerGameSettings.json`; verschachtelte Schlüssel trennt ein doppelter
 * Unterstrich. Darüber kommt auch RCON an — sonst ließe es sich nur durch
 * Bearbeiten der JSON-Datei einschalten.
 *
 * **Kein Abgangsmuster.** Der Server nennt beim Verbinden den Charakternamen,
 * beim Trennen nur die Netzverbindung. Die Spielerzahl kommt deshalb aus der
 * Steam-Abfrage; überzählige Namen aus dem Log verwirft der Adapter.
 */
export const vrisingDefinition: TemplateDefinition = {
  id: 'vrising',
  label: 'V Rising',
  summary: 'Vampir-Survival unter Wine. Einstellungen und RCON über durchgereichte Variablen.',
  image: 'trueosiris/vrising',
  defaultTag: 'latest',
  defaultMemoryMb: 8192,
  defaultCpus: 4,
  notes: [
    'Der Server läuft unter Wine; der erste Start dauert deshalb länger als bei einem nativen Image.',
    'Alles, was in ServerHostSettings.json steht, lässt sich als HOST_SETTINGS_… setzen — verschachtelte Schlüssel mit doppeltem Unterstrich.',
    'Bei gesetztem Serverpasswort ist der Beitritt über Steam nicht möglich; die Serverliste im Spiel benutzen.',
    'Die Konfigurationsdateien liegen im Volume „config“ unter Settings und überleben ein Spielupdate; das Serververzeichnis wird dabei überschrieben.',
  ],
  capabilities: {
    console: 'rcon',
    players: 'a2s',
    mods: 'none',
    moderation: false,
  },
  ports: [
    { name: 'game', label: 'Spielport', container: 9876, protocol: 'udp', defaultHost: 9876, internalOnly: false },
    { name: 'query', label: 'Steam-Abfrage', container: 9877, protocol: 'udp', defaultHost: 9877, internalOnly: false },
    { name: 'rcon', label: 'RCON', container: 25575, protocol: 'tcp', defaultHost: 25575, internalOnly: true },
  ],
  volumes: [
    { name: 'server', containerPath: '/mnt/vrising/server', role: 'data' },
    { name: 'persistentdata', containerPath: '/mnt/vrising/persistentdata', role: 'config' },
  ],
  fields: [
    {
      id: 'serverName', label: 'Servername', type: 'text', default: 'V-Rising-Server',
      required: true, maxLength: 64, editable: true, restartRequired: true, secret: false,
    },
    {
      id: 'description', label: 'Beschreibung', type: 'text', default: '',
      required: false, maxLength: 200, editable: true, restartRequired: true, secret: false,
    },
    {
      id: 'worldName', label: 'Weltname', type: 'text', default: 'world1',
      required: true, maxLength: 32, editable: true, restartRequired: true, secret: false,
      help: 'Unterverzeichnis des Spielstands. Ein Wechsel startet eine neue Welt.',
    },
    {
      id: 'maxPlayers', label: 'Slots', type: 'number', default: 40,
      min: 1, max: 100, required: true, editable: true, restartRequired: true, secret: false,
    },
    {
      id: 'serverPassword', label: 'Serverpasswort', type: 'password', default: '',
      required: false, maxLength: 64, editable: true, restartRequired: true, secret: true,
      help: 'Mit Passwort ist der Beitritt nur über die Serverliste im Spiel möglich.',
    },
    {
      id: 'gameMode', label: 'Spielmodus', type: 'select', default: 'PvP',
      options: [
        { value: 'PvP', label: 'PvP' },
        { value: 'PvE', label: 'PvE' },
      ],
      required: true, editable: true, restartRequired: true, secret: false,
    },
    {
      id: 'listed', label: 'In den Serverlisten zeigen', type: 'boolean', default: true,
      required: false, editable: true, restartRequired: true, secret: false,
      help: 'Meldet den Server bei Steam und EOS an.',
    },
  ],

  env: [
    { name: 'SERVERNAME', source: { kind: 'field', field: 'serverName' }, trim: true, omitWhenEmpty: false },
    { name: 'WORLDNAME', source: { kind: 'field', field: 'worldName' }, trim: true, omitWhenEmpty: false },
    { name: 'GAMEPORT', source: { kind: 'port', port: 'game' }, fallback: '9876', trim: false, omitWhenEmpty: false },
    { name: 'QUERYPORT', source: { kind: 'port', port: 'query' }, fallback: '9877', trim: false, omitWhenEmpty: false },
    { name: 'HOST_SETTINGS_Description', source: { kind: 'field', field: 'description' }, trim: true, omitWhenEmpty: true },
    { name: 'HOST_SETTINGS_MaxConnectedUsers', source: { kind: 'field', field: 'maxPlayers' }, fallback: '40', trim: false, omitWhenEmpty: false },
    { name: 'HOST_SETTINGS_Password', source: { kind: 'field', field: 'serverPassword' }, trim: false, omitWhenEmpty: false },
    {
      name: 'HOST_SETTINGS_ListOnSteam', source: { kind: 'field', field: 'listed' },
      boolean: { whenTrue: 'true', whenFalse: 'false' }, trim: false, omitWhenEmpty: false,
    },
    {
      name: 'HOST_SETTINGS_ListOnEOS', source: { kind: 'field', field: 'listed' },
      boolean: { whenTrue: 'true', whenFalse: 'false' }, trim: false, omitWhenEmpty: false,
    },
    { name: 'GAME_SETTINGS_GameModeType', source: { kind: 'field', field: 'gameMode' }, trim: false, omitWhenEmpty: false },
    // Ohne diese drei bliebe die Konsole ohne Gegenstelle: RCON ist im Spiel
    // ab Werk aus und steht nur in der JSON-Datei.
    { name: 'HOST_SETTINGS_Rcon__Enabled', source: { kind: 'const', value: 'true' }, trim: false, omitWhenEmpty: false },
    { name: 'HOST_SETTINGS_Rcon__Password', source: { kind: 'rconPassword' }, trim: false, omitWhenEmpty: false },
    { name: 'HOST_SETTINGS_Rcon__Port', source: { kind: 'const', value: '25575' }, trim: false, omitWhenEmpty: false },
    { name: 'TZ', source: { kind: 'timezone' }, trim: false, omitWhenEmpty: false },
  ],

  /*
   * Belegt am Beispiellog im Repository des Images:
   * `User '{Steam 1305532568}' '76561…', approvedUserIndex: 0, Character: 'Osiris' connected as ID '0,1', …`
   * `[Server] Startup Completed - Disabling Scene Loading Systems`
   * Beim Trennen nennt der Server nur die Netzverbindung, keinen Namen —
   * deshalb kein Abgangsmuster.
   */
  logPatterns: {
    join: { source: "Character: '([^']+)' connected", flags: '' },
    ready: { source: '\\[Server\\] Startup Completed', flags: '' },
  },

  validations: [
    {
      rule: 'minLength', field: 'serverPassword', value: 4,
      message: 'Mindestens 4 Zeichen', onlyWhenSet: true,
    },
  ],

  adapter: { queryPortName: 'query', rconPortName: 'rcon', maxPlayersField: 'maxPlayers' },

  fakeLog: {
    timeFormat: 'iso',
    join: "User '{{Steam {n}}}' '76561198000000000', approvedUserIndex: 0, Character: '{name}' connected as ID '0,1', Entity '375131,1'.",
    leave: "NetEndPoint '{{Steam {n}}}' disconnected. Reason: ClosedByPeer ({name})",
    ready: '[Server] Startup Completed - Disabling Scene Loading Systems',
    chatter: '[Server] Loaded Chunk {n},7',
  },

  modExtensions: [],

  backup: {
    paths: ['/mnt/vrising/persistentdata/Saves'],
    preCommands: [],
    postCommands: [],
  },
};

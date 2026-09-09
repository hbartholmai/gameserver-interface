import type { TemplateDefinition } from '../schema/template-definition.js';

/**
 * Team Fortress 2 auf Basis von `cm2network/tf2`.
 *
 * Wie bei Counter-Strike 2 hört die Source-Engine unter derselben Nummer auf
 * UDP (Spiel und Steam-Abfrage) und TCP (RCON); deshalb zwei Ports mit
 * gleicher Nummer, von denen nur einer veröffentlicht wird.
 *
 * **Der Servername greift nur beim ersten Start.** Danach steht er in
 * `tf/cfg/server.cfg` im Datenverzeichnis und wird von dort gelesen — das Image
 * sagt das ausdrücklich. Ein späterer Wechsel im Config-Reiter bleibt deshalb
 * wirkungslos, solange die Datei ihn überschreibt.
 */
export const tf2Definition: TemplateDefinition = {
  id: 'tf2',
  label: 'Team Fortress 2',
  summary: 'Klassischer TF2-Server mit RCON-Konsole und Steam-Abfrage.',
  image: 'cm2network/tf2',
  defaultTag: 'latest',
  defaultMemoryMb: 2048,
  defaultCpus: 2,
  notes: [
    'Ohne Serverschlüssel (GSLT) taucht der Server in keiner Liste auf. Zu holen unter steamcommunity.com/dev/managegameservers, App-ID 440.',
    'Der Servername wirkt nur beim ersten Start; danach gilt tf/cfg/server.cfg im Datenverzeichnis.',
    'Kick und Bann laufen über die Konsole: „kick <Name>“ und „banid <Minuten> <Kennung>“.',
    'Workshop-Karten brauchen zusätzlich einen Steam-API-Schlüssel.',
  ],
  capabilities: {
    console: 'rcon',
    players: 'a2s',
    mods: 'none',
    moderation: false,
  },
  ports: [
    { name: 'game', label: 'Spielport', container: 27015, protocol: 'udp', defaultHost: 27015, internalOnly: false },
    { name: 'rcon', label: 'RCON', container: 27015, protocol: 'tcp', defaultHost: 27015, internalOnly: true },
    { name: 'tv', label: 'SourceTV', container: 27020, protocol: 'udp', defaultHost: 27020, internalOnly: false },
  ],
  volumes: [{ name: 'tf', containerPath: '/home/steam/tf-dedicated', role: 'data' }],
  fields: [
    {
      id: 'hostname', label: 'Servername', type: 'text', default: 'Team Fortress 2',
      required: true, maxLength: 64, editable: true, restartRequired: true, secret: false,
      help: 'Wirkt nur beim ersten Start — danach entscheidet server.cfg.',
    },
    {
      id: 'srcdsToken', label: 'Serverschlüssel (GSLT)', type: 'password', default: '',
      required: false, maxLength: 64, editable: true, restartRequired: true, secret: true,
      help: 'Ohne Schlüssel läuft der Server nur im lokalen Netz.',
    },
    {
      id: 'serverPassword', label: 'Serverpasswort', type: 'password', default: '',
      required: false, maxLength: 64, editable: true, restartRequired: true, secret: true,
      help: 'Leer lassen für einen offenen Server.',
    },
    {
      id: 'maxPlayers', label: 'Slots', type: 'number', default: 24,
      min: 2, max: 32, required: true, editable: true, restartRequired: true, secret: false,
    },
    {
      id: 'startMap', label: 'Startkarte', type: 'text', default: 'ctf_2fort',
      required: true, maxLength: 64, editable: true, restartRequired: true, secret: false,
    },
    {
      id: 'mapCycle', label: 'Kartenfolge', type: 'text', default: 'mapcycle_default.txt',
      required: true, maxLength: 64, editable: true, restartRequired: true, secret: false,
      help: 'Datei im Verzeichnis tf/cfg.',
    },
    {
      id: 'region', label: 'Region', type: 'number', default: 3,
      min: 0, max: 255, required: true, editable: true, restartRequired: true, secret: false,
      help: '0 US-Ost, 1 US-West, 2 Südamerika, 3 Europa, 4 Asien, 5 Australien, 6 Naher Osten, 7 Afrika, 255 weltweit.',
    },
    {
      id: 'tickrate', label: 'Tickrate', type: 'number', default: 66,
      min: 33, max: 128, required: true, editable: true, restartRequired: true, secret: false,
      help: 'Höhere Werte kosten Rechenzeit; 66 ist der übliche Wert.',
    },
    {
      id: 'workshopKey', label: 'Steam-API-Schlüssel', type: 'password', default: '',
      required: false, maxLength: 64, editable: true, restartRequired: true, secret: true,
      help: 'Nur nötig für Workshop-Karten.',
    },
    {
      id: 'secured', label: 'VAC einschalten', type: 'boolean', default: true,
      required: false, editable: true, restartRequired: true, secret: false,
      help: 'Ausschalten nur für Testserver — ohne VAC sind Cheats ungehindert.',
    },
  ],

  env: [
    { name: 'SRCDS_HOSTNAME', source: { kind: 'field', field: 'hostname' }, trim: true, omitWhenEmpty: false },
    { name: 'SRCDS_TOKEN', source: { kind: 'field', field: 'srcdsToken' }, trim: true, omitWhenEmpty: true },
    { name: 'SRCDS_RCONPW', source: { kind: 'rconPassword' }, trim: false, omitWhenEmpty: false },
    { name: 'SRCDS_PW', source: { kind: 'field', field: 'serverPassword' }, trim: false, omitWhenEmpty: true },
    { name: 'SRCDS_MAXPLAYERS', source: { kind: 'field', field: 'maxPlayers' }, fallback: '24', trim: false, omitWhenEmpty: false },
    { name: 'SRCDS_STARTMAP', source: { kind: 'field', field: 'startMap' }, trim: true, omitWhenEmpty: false },
    { name: 'SRCDS_MAPCYCLE', source: { kind: 'field', field: 'mapCycle' }, trim: true, omitWhenEmpty: false },
    { name: 'SRCDS_REGION', source: { kind: 'field', field: 'region' }, fallback: '3', trim: false, omitWhenEmpty: false },
    { name: 'SRCDS_TICKRATE', source: { kind: 'field', field: 'tickrate' }, fallback: '66', trim: false, omitWhenEmpty: false },
    { name: 'SRCDS_WORKSHOP_AUTHKEY', source: { kind: 'field', field: 'workshopKey' }, trim: true, omitWhenEmpty: true },
    {
      name: 'SRCDS_SECURED', source: { kind: 'field', field: 'secured' },
      boolean: { whenTrue: '1', whenFalse: '0' }, trim: false, omitWhenEmpty: false,
    },
    { name: 'SRCDS_PORT', source: { kind: 'port', port: 'game' }, fallback: '27015', trim: false, omitWhenEmpty: false },
    { name: 'SRCDS_TV_PORT', source: { kind: 'port', port: 'tv' }, fallback: '27020', trim: false, omitWhenEmpty: false },
    // Der Server bindet sonst an eine Adresse, die es im Container nicht gibt.
    { name: 'SRCDS_IP', source: { kind: 'const', value: '0' }, trim: false, omitWhenEmpty: false },
    { name: 'TZ', source: { kind: 'timezone' }, trim: false, omitWhenEmpty: false },
  ],

  // Dasselbe Logformat wie bei Counter-Strike 2 — es stammt aus der Engine,
  // nicht aus dem Spiel.
  logPatterns: {
    join: { source: '"([^"<]+)<\\d+><[^>]*><[^>]*>" connected', flags: '' },
    leave: { source: '"([^"<]+)<\\d+><[^>]*><[^>]*>" disconnected', flags: '' },
    ready: { source: '(Log file started|Connection to Steam servers successful)', flags: '' },
    clean: { pattern: { source: '^L [\\d/]+(?: - )?[\\d:]+:\\s*', flags: '' }, replacement: '' },
  },

  validations: [
    {
      rule: 'minLength', field: 'serverPassword', value: 4,
      message: 'Mindestens 4 Zeichen', onlyWhenSet: true,
    },
  ],

  adapter: { queryPortName: 'game', rconPortName: 'rcon', maxPlayersField: 'maxPlayers' },

  fakeLog: {
    timeFormat: 'dmy',
    join: 'L {time}: "{name}<{n}><[U:1:1234567]><>" connected, address "10.0.0.5:27005"',
    leave: 'L {time}: "{name}<{n}><[U:1:1234567]><Red>" disconnected (reason "Disconnect by user.")',
    ready: 'L {time}: Log file started (file "logs/L000_27015.log") (game "tf") (version "8500")',
    chatter: 'L {time}: World triggered "Round_Win" (winner "Red") ({n})',
  },

  modExtensions: [],

  backup: {
    paths: ['/home/steam/tf-dedicated/tf/cfg'],
    preCommands: [],
    postCommands: [],
  },
};

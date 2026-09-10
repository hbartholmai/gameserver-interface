import type { TemplateDefinition } from '../schema/template-definition.js';

/**
 * Satisfactory auf Basis von `wolveix/satisfactory-server`.
 *
 * **Der Server hat weder Konsole noch Serverabfrage.** Verwaltet wird er über
 * die Server-API im Spiel selbst — dort werden auch Name, Passwort und
 * Adminzugang gesetzt, nicht über die Umgebung. Das Image steuert die
 * Betriebsseite: Slots, Tickrate, Autosaves, Ports.
 *
 * **Die Spielerliste bleibt deshalb leer.** Das Image startet den Server mit
 * `LogNet=Error`; Beitritte protokolliert Unreal dann nicht mehr. Das Muster
 * greift die übliche Zeile trotzdem ab, damit es passt, wenn jemand die
 * Protokollstufe hebt.
 */
export const satisfactoryDefinition: TemplateDefinition = {
  id: 'satisfactory',
  label: 'Satisfactory',
  summary: 'Fabrikbau-Server. Eingerichtet wird er im Spiel über die Server-API.',
  image: 'wolveix/satisfactory-server',
  defaultTag: 'latest',
  // Die Doku warnt ausdrücklich: im späten Spiel oder mit vier Spielern läuft
  // der Server gegen eine knapp gesetzte Speichergrenze.
  defaultMemoryMb: 12288,
  defaultCpus: 4,
  notes: [
    'Servername, Adminpasswort und Beitrittspasswort werden beim ersten Verbinden im Spiel gesetzt — das Image kennt dafür keine Variablen.',
    'Die Spielerliste bleibt leer: das Image schaltet Unreals Netzprotokoll auf Fehler, Beitritte tauchen im Log nicht auf.',
    'Die Spieldateien liegen mit über 8 GB im Volume, damit ein neuer Container sie nicht erneut lädt.',
    'Zu wenig Arbeitsspeicher fällt erst in der späten Fabrik auf — dann bricht der Server beim Speichern ab.',
  ],
  capabilities: {
    console: 'readonly',
    players: 'log',
    mods: 'none',
    moderation: false,
  },
  ports: [
    { name: 'game', label: 'Spielport', container: 7777, protocol: 'udp', defaultHost: 7777, internalOnly: false },
    { name: 'api', label: 'Server-API', container: 7777, protocol: 'tcp', defaultHost: 7777, internalOnly: false },
    { name: 'messaging', label: 'Nachrichtenport', container: 8888, protocol: 'tcp', defaultHost: 8888, internalOnly: false },
  ],
  volumes: [{ name: 'config', containerPath: '/config', role: 'data' }],
  fields: [
    {
      id: 'maxPlayers', label: 'Slots', type: 'number', default: 4,
      min: 1, max: 16, required: true, editable: true, restartRequired: true, secret: false,
    },
    {
      id: 'maxTickRate', label: 'Tickrate', type: 'number', default: 30,
      min: 5, max: 120, required: true, editable: true, restartRequired: true, secret: false,
      help: 'Höhere Werte kosten Rechenzeit, machen die Fabrik aber flüssiger.',
    },
    {
      id: 'autosaveNum', label: 'Autosaves', type: 'number', default: 5,
      min: 1, max: 50, required: true, editable: true, restartRequired: true, secret: false,
      help: 'Wie viele Spielstände abwechselnd geschrieben werden.',
    },
    {
      id: 'timeout', label: 'Zeitüberschreitung (s)', type: 'number', default: 30,
      min: 10, max: 300, required: true, editable: true, restartRequired: true, secret: false,
      help: 'Nach dieser Zeit ohne Antwort gilt ein Client als getrennt.',
    },
    {
      id: 'serverStreaming', label: 'Weltdaten nachladen', type: 'boolean', default: true,
      required: false, editable: true, restartRequired: true, secret: false,
      help: 'Aus: der Server hält die ganze Welt im Speicher — nur mit viel RAM sinnvoll.',
    },
    {
      id: 'seasonalEvents', label: 'Saisonale Ereignisse', type: 'boolean', default: true,
      required: false, editable: true, restartRequired: true, secret: false,
      help: 'Schaltet das FICSMAS-Ereignis ein oder aus.',
    },
    {
      id: 'skipUpdate', label: 'Beim Start nicht aktualisieren', type: 'boolean', default: false,
      required: false, editable: true, restartRequired: true, secret: false,
      help: 'Spart Zeit beim Start, lässt den Server aber auf altem Stand.',
    },
    {
      id: 'experimental', label: 'Experimentelle Fassung', type: 'boolean', default: false,
      required: false, editable: true, restartRequired: true, secret: false,
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
    { name: 'MAXPLAYERS', source: { kind: 'field', field: 'maxPlayers' }, fallback: '4', trim: false, omitWhenEmpty: false },
    { name: 'MAXTICKRATE', source: { kind: 'field', field: 'maxTickRate' }, fallback: '30', trim: false, omitWhenEmpty: false },
    { name: 'AUTOSAVENUM', source: { kind: 'field', field: 'autosaveNum' }, fallback: '5', trim: false, omitWhenEmpty: false },
    { name: 'TIMEOUT', source: { kind: 'field', field: 'timeout' }, fallback: '30', trim: false, omitWhenEmpty: false },
    {
      name: 'SERVERSTREAMING', source: { kind: 'field', field: 'serverStreaming' },
      boolean: { whenTrue: 'true', whenFalse: 'false' }, trim: false, omitWhenEmpty: false,
    },
    // Umgekehrte Bedeutung: das Image schaltet die Ereignisse *ab*.
    {
      name: 'DISABLESEASONALEVENTS', source: { kind: 'field', field: 'seasonalEvents' },
      boolean: { whenTrue: 'false', whenFalse: 'true' }, trim: false, omitWhenEmpty: false,
    },
    {
      name: 'SKIPUPDATE', source: { kind: 'field', field: 'skipUpdate' },
      boolean: { whenTrue: 'true', whenFalse: 'false' }, trim: false, omitWhenEmpty: false,
    },
    {
      name: 'STEAMBETA', source: { kind: 'field', field: 'experimental' },
      boolean: { whenTrue: 'true', whenFalse: 'false' }, trim: false, omitWhenEmpty: false,
    },
    { name: 'SERVERGAMEPORT', source: { kind: 'port', port: 'game' }, fallback: '7777', trim: false, omitWhenEmpty: false },
    { name: 'SERVERMESSAGINGPORT', source: { kind: 'port', port: 'messaging' }, fallback: '8888', trim: false, omitWhenEmpty: false },
    { name: 'PUID', source: { kind: 'field', field: 'puid' }, fallback: '1000', trim: false, omitWhenEmpty: false },
    { name: 'PGID', source: { kind: 'field', field: 'pgid' }, fallback: '1000', trim: false, omitWhenEmpty: false },
    { name: 'TZ', source: { kind: 'timezone' }, trim: false, omitWhenEmpty: false },
  ],

  /*
   * Belegt am Beispiellog im Repository des Images:
   * `[2024.09.12-11.27.38:063][  0]LogServer: Display: Server API listening on '0.0.0.0:7777' (Standalone)`
   * Die Beitrittszeile ist die übliche der Unreal-Engine; sie erscheint nur,
   * wenn LogNet über „Error“ hinaus gesetzt wird.
   */
  logPatterns: {
    join: { source: 'Join succeeded: (.+)$', flags: '' },
    ready: { source: 'Server API listening on', flags: '' },
    clean: { pattern: { source: '^\\[[\\d.\\-:]+\\]\\[[ \\d]+\\]', flags: '' }, replacement: '' },
  },

  validations: [],

  adapter: { maxPlayersField: 'maxPlayers' },

  fakeLog: {
    timeFormat: 'iso',
    join: '[{time}][{n}]LogNet: Join succeeded: {name}',
    leave: '[{time}][{n}]LogNet: UChannel::Close: Sending CloseBunch ({name})',
    ready: "[{time}][  0]LogServer: Display: Server API listening on '0.0.0.0:7777' (Standalone)",
    chatter: '[{time}][{n}]LogGame: Autosaving world',
  },

  modExtensions: [],

  backup: {
    // Spielstände, Baupläne und Serverkonfiguration; die 8 GB Spieldateien
    // daneben lädt das Image jederzeit neu.
    paths: ['/config/saved'],
    preCommands: [],
    postCommands: [],
  },
};

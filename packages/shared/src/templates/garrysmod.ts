import type { TemplateDefinition } from '../schema/template-definition.js';

/**
 * Garry's Mod auf Basis von `hackebein/garrysmod`.
 *
 * **Keine Konsole, obwohl die Engine RCON kann.** Das Image kennt keine
 * Umgebungsvariable für das RCON-Passwort; es stünde nur in `cfg/server.cfg`,
 * die der Betreiber selbst einhängt. Eine Vorlage, die `console: rcon` zusagt,
 * ohne das Passwort setzen zu können, ergäbe eine Konsole, die sich nie
 * verbindet — deshalb `readonly` und die Spielerzahl per Steam-Abfrage.
 *
 * Aus demselben Grund gibt es hier kein Feld für den Servername: `hostname`
 * gehört in dieselbe Datei.
 */
export const garrysmodDefinition: TemplateDefinition = {
  id: 'garrysmod',
  label: "Garry's Mod",
  summary: 'Physik-Sandkasten mit Workshop-Sammlungen. Einstellungen über server.cfg.',
  image: 'hackebein/garrysmod',
  defaultTag: 'latest',
  defaultMemoryMb: 4096,
  defaultCpus: 2,
  notes: [
    'Servername, RCON und alles Weitere stehen in cfg/server.cfg im Datenverzeichnis — das Image kennt dafür keine Variablen.',
    'Der Steam-API-Schlüssel schaltet den Workshop frei; ohne ihn bleiben Sammlungen leer.',
    'Ohne Serverschlüssel (GSLT) taucht der Server in keiner Liste auf. App-ID 4000.',
    'Der Spielmodus muss als Workshop-Sammlung mitgeladen werden, sonst startet der Server in den Sandkasten zurück.',
  ],
  capabilities: {
    console: 'readonly',
    players: 'a2s',
    mods: 'none',
    moderation: false,
  },
  ports: [
    { name: 'game', label: 'Spielport', container: 27015, protocol: 'udp', defaultHost: 27015, internalOnly: false },
  ],
  volumes: [{ name: 'garrysmod', containerPath: '/opt/steam/garrysmod', role: 'data' }],
  fields: [
    {
      id: 'gamemode', label: 'Spielmodus', type: 'text', default: 'sandbox',
      required: true, maxLength: 64, editable: true, restartRequired: true, secret: false,
      help: 'Etwa sandbox, terrortown, darkrp — der Modus muss auf dem Server liegen.',
    },
    {
      id: 'map', label: 'Startkarte', type: 'text', default: 'gm_flatgrass',
      required: true, maxLength: 64, editable: true, restartRequired: true, secret: false,
    },
    {
      id: 'maxPlayers', label: 'Slots', type: 'number', default: 16,
      min: 2, max: 128, required: true, editable: true, restartRequired: true, secret: false,
    },
    {
      id: 'authkey', label: 'Steam-API-Schlüssel', type: 'password', default: '',
      required: false, maxLength: 64, editable: true, restartRequired: true, secret: true,
      help: 'Nötig für Workshop-Inhalte. Zu holen unter steamcommunity.com/dev/apikey.',
    },
    {
      id: 'glst', label: 'Serverschlüssel (GSLT)', type: 'password', default: '',
      required: false, maxLength: 64, editable: true, restartRequired: true, secret: true,
      help: 'Wird bei gesetztem API-Schlüssel automatisch erzeugt.',
    },
    {
      id: 'workshop', label: 'Workshop-Sammlung (Server)', type: 'text', default: '',
      required: false, maxLength: 32, editable: true, restartRequired: true, secret: false,
      help: 'Kennung der Sammlung, die der Server selbst lädt.',
    },
    {
      id: 'workshopDl', label: 'Workshop-Sammlung (Clients)', type: 'text', default: '',
      required: false, maxLength: 32, editable: true, restartRequired: true, secret: false,
      help: 'Kennung der Sammlung, die Spieler vor dem Beitritt herunterladen.',
    },
    {
      id: 'tickrate', label: 'Tickrate', type: 'number', default: 66,
      min: 33, max: 128, required: true, editable: true, restartRequired: true, secret: false,
      help: 'Das Image rät vom Ändern ab.',
    },
  ],

  env: [
    { name: 'GAMEMODE', source: { kind: 'field', field: 'gamemode' }, trim: true, omitWhenEmpty: false },
    { name: 'MAP', source: { kind: 'field', field: 'map' }, trim: true, omitWhenEmpty: false },
    { name: 'MAXPLAYERS', source: { kind: 'field', field: 'maxPlayers' }, fallback: '16', trim: false, omitWhenEmpty: false },
    { name: 'TICKRATE', source: { kind: 'field', field: 'tickrate' }, fallback: '66', trim: false, omitWhenEmpty: false },
    { name: 'AUTHKEY', source: { kind: 'field', field: 'authkey' }, trim: true, omitWhenEmpty: true },
    { name: 'GLST', source: { kind: 'field', field: 'glst' }, trim: true, omitWhenEmpty: true },
    { name: 'WORKSHOP', source: { kind: 'field', field: 'workshop' }, trim: true, omitWhenEmpty: true },
    { name: 'WORKSHOPDL', source: { kind: 'field', field: 'workshopDl' }, trim: true, omitWhenEmpty: true },
    { name: 'TZ', source: { kind: 'timezone' }, trim: false, omitWhenEmpty: false },
  ],

  // Source-Engine wie bei Counter-Strike 2 und Team Fortress 2.
  logPatterns: {
    join: { source: '"([^"<]+)<\\d+><[^>]*><[^>]*>" connected', flags: '' },
    leave: { source: '"([^"<]+)<\\d+><[^>]*><[^>]*>" disconnected', flags: '' },
    ready: { source: '(Log file started|Connection to Steam servers successful|VAC secure mode is activated)', flags: '' },
    clean: { pattern: { source: '^L [\\d/]+(?: - )?[\\d:]+:\\s*', flags: '' }, replacement: '' },
  },

  validations: [],

  adapter: { queryPortName: 'game', maxPlayersField: 'maxPlayers' },

  fakeLog: {
    timeFormat: 'dmy',
    join: 'L {time}: "{name}<{n}><[U:1:1234567]><>" connected, address "10.0.0.5:27005"',
    leave: 'L {time}: "{name}<{n}><[U:1:1234567]><>" disconnected (reason "Disconnect by user.")',
    ready: 'L {time}: VAC secure mode is activated.',
    chatter: 'L {time}: Lua: gamemode loaded ({n} ms)',
  },

  modExtensions: [],

  backup: {
    paths: ['/opt/steam/garrysmod/cfg', '/opt/steam/garrysmod/data'],
    preCommands: [],
    postCommands: [],
  },
};

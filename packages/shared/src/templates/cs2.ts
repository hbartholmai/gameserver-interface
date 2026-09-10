import type { TemplateDefinition } from '../schema/template-definition.js';

/**
 * Counter-Strike 2 auf Basis von `joedwards32/cs2`.
 *
 * **RCON läuft über den Spielport, nur in TCP.** Deshalb zwei Ports mit
 * derselben Nummer: `game` (UDP, veröffentlicht) und `rcon` (TCP, nur
 * containerintern). Das ist keine Doppelung — die Source-Engine hört auf
 * beiden Protokollen unter derselben Nummer.
 *
 * Die Spielerzahl kommt trotzdem per Steam-Abfrage und nicht über RCON:
 * `status` antwortet mit einer Tabelle, deren Form sich zwischen Fassungen
 * ändert; die A2S-Abfrage antwortet auf demselben Port mit einer Zahl.
 *
 * **Kein Kick und kein Bann.** `kick` kennt zwar Namen, `banid` aber nur
 * Steam-Kennungen, und beides hängt an derselben Fähigkeit. Lieber keine
 * Knöpfe als ein Bann, der nichts tut.
 */
export const cs2Definition: TemplateDefinition = {
  id: 'cs2',
  label: 'Counter-Strike 2',
  summary: 'Wettkampfserver mit RCON-Konsole. Braucht viel Plattenplatz und einen Serverschlüssel.',
  image: 'joedwards32/cs2',
  defaultTag: 'latest',
  defaultMemoryMb: 4096,
  defaultCpus: 2,
  notes: [
    'Das Spiel belegt rund 60 GB im Datenverzeichnis; das Image lädt es beim ersten Start herunter.',
    'Ohne Serverschlüssel (GSLT) taucht der Server in keiner Liste auf. Zu holen unter steamcommunity.com/dev/managegameservers, App-ID 730.',
    'Kick und Bann laufen über die Konsole: „kick <Name>“ und „banid <Minuten> <Kennung>“.',
    'Der Ruhezustand ist ausgeschaltet — er hat in diesem Image Abstürze ausgelöst.',
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
    { name: 'tv', label: 'CSTV', container: 27020, protocol: 'udp', defaultHost: 27020, internalOnly: false },
  ],
  volumes: [{ name: 'cs2', containerPath: '/home/steam/cs2-dedicated', role: 'data' }],
  fields: [
    {
      id: 'serverName', label: 'Servername', type: 'text', default: 'Counter-Strike 2',
      required: true, maxLength: 64, editable: true, restartRequired: true, secret: false,
      help: 'Ein Schrägstrich im Namen muss als \\/ geschrieben werden — das verlangt das Image.',
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
      id: 'maxPlayers', label: 'Slots', type: 'number', default: 10,
      min: 2, max: 64, required: true, editable: true, restartRequired: true, secret: false,
    },
    {
      id: 'gameAlias', label: 'Spielart', type: 'select', default: 'competitive',
      options: [
        { value: 'competitive', label: 'Wettkampf' },
        { value: 'casual', label: 'Gelegenheitsspiel' },
        { value: 'deathmatch', label: 'Deathmatch' },
      ],
      required: true, editable: true, restartRequired: true, secret: false,
    },
    {
      id: 'startMap', label: 'Startkarte', type: 'text', default: 'de_inferno',
      required: true, maxLength: 64, editable: true, restartRequired: true, secret: false,
    },
    {
      id: 'mapGroup', label: 'Kartenpool', type: 'text', default: 'mg_active',
      required: true, maxLength: 64, editable: true, restartRequired: true, secret: false,
    },
    {
      id: 'botQuota', label: 'Bots', type: 'number', default: 0,
      min: 0, max: 64, required: false, editable: true, restartRequired: true, secret: false,
    },
    {
      id: 'sourceTv', label: 'CSTV einschalten', type: 'boolean', default: false,
      required: false, editable: true, restartRequired: true, secret: false,
      help: 'Überträgt das Spiel an Zuschauer auf dem CSTV-Port.',
    },
    {
      id: 'cheats', label: 'Cheats erlauben', type: 'boolean', default: false,
      required: false, editable: true, restartRequired: true, secret: false,
    },
  ],

  env: [
    { name: 'CS2_SERVERNAME', source: { kind: 'field', field: 'serverName' }, trim: true, omitWhenEmpty: false },
    { name: 'SRCDS_TOKEN', source: { kind: 'field', field: 'srcdsToken' }, trim: true, omitWhenEmpty: true },
    { name: 'CS2_RCONPW', source: { kind: 'rconPassword' }, trim: false, omitWhenEmpty: false },
    { name: 'CS2_PW', source: { kind: 'field', field: 'serverPassword' }, trim: false, omitWhenEmpty: true },
    { name: 'CS2_MAXPLAYERS', source: { kind: 'field', field: 'maxPlayers' }, fallback: '10', trim: false, omitWhenEmpty: false },
    { name: 'CS2_GAMEALIAS', source: { kind: 'field', field: 'gameAlias' }, trim: false, omitWhenEmpty: false },
    { name: 'CS2_STARTMAP', source: { kind: 'field', field: 'startMap' }, trim: true, omitWhenEmpty: false },
    { name: 'CS2_MAPGROUP', source: { kind: 'field', field: 'mapGroup' }, trim: true, omitWhenEmpty: false },
    { name: 'CS2_BOT_QUOTA', source: { kind: 'field', field: 'botQuota' }, fallback: '0', trim: false, omitWhenEmpty: false },
    { name: 'CS2_PORT', source: { kind: 'port', port: 'game' }, fallback: '27015', trim: false, omitWhenEmpty: false },
    { name: 'TV_PORT', source: { kind: 'port', port: 'tv' }, fallback: '27020', trim: false, omitWhenEmpty: false },
    {
      name: 'TV_ENABLE', source: { kind: 'field', field: 'sourceTv' },
      boolean: { whenTrue: '1', whenFalse: '0' }, trim: false, omitWhenEmpty: false,
    },
    {
      name: 'CS2_CHEATS', source: { kind: 'field', field: 'cheats' },
      boolean: { whenTrue: '1', whenFalse: '0' }, trim: false, omitWhenEmpty: false,
    },
    // Der Ruhezustand spart Rechenzeit, hat laut Doku des Images aber Abstürze
    // ausgelöst. Das Panel misst ohnehin im Takt weiter.
    { name: 'CS2_SERVER_HIBERNATE', source: { kind: 'const', value: '0' }, trim: false, omitWhenEmpty: false },
    { name: 'CS2_LAN', source: { kind: 'const', value: '0' }, trim: false, omitWhenEmpty: false },
    // Ohne diese beiden schreibt der Server nichts, was der Log-Strom auswerten
    // könnte — Beitritte blieben unsichtbar.
    { name: 'CS2_LOG', source: { kind: 'const', value: 'on' }, trim: false, omitWhenEmpty: false },
    { name: 'CS2_LOG_ECHO', source: { kind: 'const', value: '1' }, trim: false, omitWhenEmpty: false },
    { name: 'TZ', source: { kind: 'timezone' }, trim: false, omitWhenEmpty: false },
  ],

  /*
   * Das Logformat der Source-Engine ist seit Jahren unverändert:
   * `L 09/09/2026 - 12:34:56: "Kai<2><[U:1:1234]><CT>" disconnected (reason "…")`
   * Die Muster greifen deshalb am Rumpf und nicht am Zeitstempel.
   */
  logPatterns: {
    join: { source: '"([^"<]+)<\\d+><[^>]*><[^>]*>" connected', flags: '' },
    leave: { source: '"([^"<]+)<\\d+><[^>]*><[^>]*>" disconnected', flags: '' },
    ready: { source: '(Log file started|Connection to Steam servers successful)', flags: '' },
    // Der Bindestrich zwischen Datum und Uhrzeit ist optional, weil die
    // Fake-Laufzeit ihn nicht erzeugen kann — der Rumpf bleibt derselbe.
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
    leave: 'L {time}: "{name}<{n}><[U:1:1234567]><CT>" disconnected (reason "Disconnect by user.")',
    ready: 'L {time}: Log file started (file "logs/L000_27015.log") (game "csgo") (version "14000")',
    chatter: 'L {time}: World triggered "Round_Start" ({n})',
  },

  modExtensions: [],

  // Das Spielverzeichnis ist 60 GB groß und lädt sich jederzeit neu herunter;
  // gesichert wird nur, was der Betreiber selbst geschrieben hat.
  backup: {
    paths: ['/home/steam/cs2-dedicated/game/csgo/cfg'],
    preCommands: [],
    postCommands: [],
  },
};

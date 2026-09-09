import type { TemplateDefinition } from '../schema/template-definition.js';

/**
 * ARK: Survival Evolved auf Basis von `hermsi/ark-server`.
 *
 * Das Image bringt `arkmanager` mit; alles liegt im Volume unter `/app`, die
 * Serverinstallation selbst in `/app/server`. Das ist ein sehr großer
 * Download — der erste Start dauert entsprechend.
 *
 * **Das Adminpasswort ist zugleich das RCON-Passwort**, deshalb stammt es aus
 * dem Instanzgeheimnis und nicht aus einem Formularfeld. Kick und Bann bleiben
 * trotzdem aus: `KickPlayer` will eine Steam-Kennung, `BanPlayer` einen Namen —
 * das Panel führt nur Namen und könnte den Kick nicht bedienen.
 */
export const arkDefinition: TemplateDefinition = {
  id: 'ark',
  label: 'ARK: Survival Evolved',
  summary: 'Dino-Survival mit RCON-Konsole. Sehr großer Download und hoher Speicherbedarf.',
  image: 'hermsi/ark-server',
  defaultTag: 'latest',
  // Die Karte allein belegt mehrere Gigabyte; unter 8 GB wird der Server beim
  // Speichern unruhig.
  defaultMemoryMb: 12288,
  defaultCpus: 4,
  notes: [
    'Der erste Start lädt den Server über steamcmd herunter — das dauert lange und braucht rund 30 GB im Datenverzeichnis.',
    'Das Adminpasswort erzeugt das Panel; es gilt zugleich für die RCON-Konsole und die Adminkonsole im Spiel.',
    'Kick und Bann laufen über die Konsole: „KickPlayer <Kennung>“ und „BanPlayer <Name>“.',
    'Bei eingeschaltetem Crossplay sollte BattlEye aus bleiben — es wirft Epic-Spieler sonst heraus.',
    'Mods werden als Werkstatt-Kennungen angegeben und beim Start geladen, nicht als Dateien hochgeladen.',
  ],
  capabilities: {
    console: 'rcon',
    players: 'a2s',
    mods: 'none',
    moderation: false,
  },
  ports: [
    { name: 'game', label: 'Spielport', container: 7777, protocol: 'udp', defaultHost: 7777, internalOnly: false },
    { name: 'raw', label: 'UDP-Socket', container: 7778, protocol: 'udp', defaultHost: 7778, internalOnly: false },
    { name: 'query', label: 'Serverliste', container: 27015, protocol: 'udp', defaultHost: 27015, internalOnly: false },
    { name: 'rcon', label: 'RCON', container: 27020, protocol: 'tcp', defaultHost: 27020, internalOnly: true },
  ],
  volumes: [{ name: 'app', containerPath: '/app', role: 'data' }],
  fields: [
    {
      id: 'sessionName', label: 'Sitzungsname', type: 'text', default: 'ARK-Server',
      required: true, maxLength: 64, editable: true, restartRequired: true, secret: false,
      help: 'So erscheint der Server im Browser des Spiels.',
    },
    {
      id: 'map', label: 'Karte', type: 'select', default: 'TheIsland',
      options: [
        { value: 'TheIsland', label: 'The Island' },
        { value: 'TheCenter', label: 'The Center' },
        { value: 'ScorchedEarth_P', label: 'Scorched Earth' },
        { value: 'Aberration_P', label: 'Aberration' },
        { value: 'Extinction', label: 'Extinction' },
        { value: 'Ragnarok', label: 'Ragnarok' },
        { value: 'Valguero_P', label: 'Valguero' },
        { value: 'CrystalIsles', label: 'Crystal Isles' },
        { value: 'Genesis', label: 'Genesis' },
        { value: 'Gen2', label: 'Genesis 2' },
        { value: 'LostIsland', label: 'Lost Island' },
        { value: 'Fjordur', label: 'Fjordur' },
      ],
      required: true, editable: true, restartRequired: true, secret: false,
    },
    {
      id: 'serverPassword', label: 'Serverpasswort', type: 'password', default: '',
      required: false, maxLength: 64, editable: true, restartRequired: true, secret: true,
      help: 'Leer lassen für einen offenen Server.',
    },
    {
      id: 'maxPlayers', label: 'Slots', type: 'number', default: 20,
      min: 1, max: 127, required: true, editable: true, restartRequired: true, secret: false,
    },
    {
      id: 'modIds', label: 'Mod-Kennungen', type: 'text', default: '',
      required: false, maxLength: 500, editable: true, restartRequired: true, secret: false,
      help: 'Werkstatt-Kennungen, durch Komma getrennt.',
    },
    {
      id: 'crossplay', label: 'Crossplay erlauben', type: 'boolean', default: false,
      required: false, editable: true, restartRequired: true, secret: false,
      help: 'Lässt Epic-Spieler zu. Dann BattlEye ausschalten.',
    },
    {
      id: 'battleye', label: 'BattlEye einschalten', type: 'boolean', default: true,
      required: false, editable: true, restartRequired: true, secret: false,
    },
    {
      id: 'updateOnStart', label: 'Beim Start aktualisieren', type: 'boolean', default: false,
      required: false, editable: true, restartRequired: true, secret: false,
      help: 'Verzögert jeden Start um die Prüfung, hält den Server aber aktuell.',
    },
  ],

  env: [
    { name: 'SESSION_NAME', source: { kind: 'field', field: 'sessionName' }, trim: true, omitWhenEmpty: false },
    { name: 'SERVER_MAP', source: { kind: 'field', field: 'map' }, trim: false, omitWhenEmpty: false },
    // Ohne Wert wäre das voreingestellte Passwort des Images gesetzt — die
    // Variable muss also auch leer gesetzt werden, nicht weggelassen.
    { name: 'SERVER_PASSWORD', source: { kind: 'field', field: 'serverPassword' }, trim: false, omitWhenEmpty: false },
    { name: 'ADMIN_PASSWORD', source: { kind: 'rconPassword' }, trim: false, omitWhenEmpty: false },
    { name: 'MAX_PLAYERS', source: { kind: 'field', field: 'maxPlayers' }, fallback: '20', trim: false, omitWhenEmpty: false },
    { name: 'GAME_MOD_IDS', source: { kind: 'field', field: 'modIds' }, trim: true, omitWhenEmpty: true },
    {
      name: 'ENABLE_CROSSPLAY', source: { kind: 'field', field: 'crossplay' },
      boolean: { whenTrue: 'true', whenFalse: 'false' }, trim: false, omitWhenEmpty: false,
    },
    // Umgekehrte Bedeutung: das Image schaltet BattlEye *ab*.
    {
      name: 'DISABLE_BATTLEYE', source: { kind: 'field', field: 'battleye' },
      boolean: { whenTrue: 'false', whenFalse: 'true' }, trim: false, omitWhenEmpty: false,
    },
    {
      name: 'UPDATE_ON_START', source: { kind: 'field', field: 'updateOnStart' },
      boolean: { whenTrue: 'true', whenFalse: 'false' }, trim: false, omitWhenEmpty: false,
    },
    { name: 'GAME_CLIENT_PORT', source: { kind: 'port', port: 'game' }, fallback: '7777', trim: false, omitWhenEmpty: false },
    { name: 'UDP_SOCKET_PORT', source: { kind: 'port', port: 'raw' }, fallback: '7778', trim: false, omitWhenEmpty: false },
    { name: 'SERVER_LIST_PORT', source: { kind: 'port', port: 'query' }, fallback: '27015', trim: false, omitWhenEmpty: false },
    { name: 'RCON_PORT', source: { kind: 'const', value: '27020' }, trim: false, omitWhenEmpty: false },
    { name: 'TZ', source: { kind: 'timezone' }, trim: false, omitWhenEmpty: false },
  ],

  /*
   * ARK meldet Beitritt und Abgang im Klartext: `Kai joined this ARK!` und
   * `Kai left this ARK!`. Davor steht der Zeitstempel der Engine im Format
   * `2026.09.09_12.34.56:`.
   */
  logPatterns: {
    // Der Name darf weder Doppelpunkt noch führenden Leerraum enthalten: sonst
    // nimmt Gruppe 1 den Zeitstempel mit, der davor steht.
    join: { source: '([^:\\s][^:]*?) joined this ARK!', flags: '' },
    leave: { source: '([^:\\s][^:]*?) left this ARK!', flags: '' },
    ready: { source: 'Server has completed startup and is now advertising for join', flags: '' },
    clean: { pattern: { source: '^[\\d._]+:\\s*', flags: '' }, replacement: '' },
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
    join: '{time}: {name} joined this ARK!',
    leave: '{time}: {name} left this ARK!',
    ready: '{time}: Server has completed startup and is now advertising for join.',
    chatter: '{time}: Saving world to disk ({n} ms)',
  },

  modExtensions: [],

  backup: {
    // Nur der Spielstand samt Konfiguration; die Installation daneben ist
    // dutzende Gigabyte groß und jederzeit wiederherstellbar.
    paths: ['/app/server/ShooterGame/Saved'],
    // Vor dem Sichern speichern, sonst fehlt alles seit dem letzten Autosave.
    preCommands: ['saveworld'],
    postCommands: [],
  },
};

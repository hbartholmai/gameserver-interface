import type { TemplateDefinition } from '../schema/template-definition.js';

/**
 * Palworld auf Basis von `thijsvanloef/palworld-server-docker`.
 *
 * **Die erste Vorlage, die Konsole und Spielerliste aus verschiedenen Quellen
 * bezieht.** Palworld spricht echtes Source-RCON, aber der Befehl `ShowPlayers`
 * liefert CSV statt Minecrafts Satzform, und die Spielerzahl kommt schneller
 * und ohne Passwort über die Steam-Abfrage auf Port 27015. Deshalb
 * `console: 'rcon'` neben `players: 'a2s'`.
 *
 * **Kein Kick und kein Bann**, obwohl RCON sie kennt: `KickPlayer` und
 * `BanPlayer` adressieren Spieler über ihre SteamID. Das Panel führt nur
 * Namen. Die Knöpfe wären da und lieferten nichts — also lieber keine Knöpfe.
 *
 * `ADMIN_PASSWORD` ist zugleich das RCON-Passwort; es stammt deshalb aus dem
 * Instanzgeheimnis und nicht aus einem Formularfeld.
 */
export const palworldDefinition: TemplateDefinition = {
  id: 'palworld',
  label: 'Palworld',
  summary: 'Palworld-Server mit RCON-Konsole und Steam-Abfrage. Kick und Bann nur im Spiel.',
  image: 'thijsvanloef/palworld-server-docker',
  defaultTag: 'latest',
  // Die Doku nennt 16 GB als Minimum und über 32 GB als Empfehlung. 16384 ist
  // die untere Kante, kein Komfortwert — weniger führt zu Rucklern beim Speichern.
  defaultMemoryMb: 16384,
  defaultCpus: 4,
  notes: [
    'Palworld braucht viel Arbeitsspeicher: 16 GB sind das Minimum, ab etwa 32 GB läuft es rund.',
    'Das Administratorpasswort ist zugleich das RCON-Passwort und schaltet die Konsole frei.',
    'Kick und Bann brauchen SteamIDs; das Panel führt nur Namen. Beides geht über die Konsole: KickPlayer <SteamID>.',
    'Für die Anzeige in der Community-Serverliste „Community-Server“ einschalten — zusammen mit einem Serverpasswort.',
  ],
  capabilities: {
    console: 'rcon',
    players: 'a2s',
    mods: 'none',
    moderation: false,
  },
  ports: [
    { name: 'game', label: 'Spielport', container: 8211, protocol: 'udp', defaultHost: 8211, internalOnly: false },
    { name: 'query', label: 'Steam-Abfrage', container: 27015, protocol: 'udp', defaultHost: 27015, internalOnly: false },
    { name: 'rcon', label: 'RCON', container: 25575, protocol: 'tcp', defaultHost: 25575, internalOnly: true },
  ],
  volumes: [{ name: 'palworld', containerPath: '/palworld', role: 'data' }],
  fields: [
    {
      id: 'serverName', label: 'Servername', type: 'text', default: 'Palworld-Server',
      required: true, maxLength: 60, editable: true, restartRequired: true, secret: false,
    },
    {
      id: 'serverDescription', label: 'Beschreibung', type: 'text', default: '',
      required: false, maxLength: 200, editable: true, restartRequired: true, secret: false,
    },
    {
      id: 'players', label: 'Slots', type: 'number', default: 16,
      min: 1, max: 32, required: true, editable: true, restartRequired: true, secret: false,
      help: 'Palworld erlaubt höchstens 32 Spieler.',
    },
    {
      id: 'serverPassword', label: 'Serverpasswort', type: 'password', default: '',
      required: false, maxLength: 64, editable: true, restartRequired: true, secret: true,
      help: 'Leer lassen für einen offenen Server.',
    },
    {
      id: 'community', label: 'In der Community-Liste zeigen', type: 'boolean', default: false,
      required: false, editable: true, restartRequired: true, secret: false,
      help: 'Nur zusammen mit einem Serverpasswort sinnvoll — sonst tritt jeder bei.',
    },
    {
      id: 'multithreading', label: 'Mehrere Threads nutzen', type: 'boolean', default: true,
      required: false, editable: true, restartRequired: true, secret: false,
      help: 'Bringt bis etwa vier Threads etwas; darüber hinaus nicht mehr.',
    },
    {
      id: 'updateOnBoot', label: 'Beim Start aktualisieren', type: 'boolean', default: true,
      required: false, editable: true, restartRequired: true, secret: false,
      help: 'Muss beim ersten Start an sein — sonst ist der Server gar nicht installiert.',
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
    { name: 'SERVER_NAME', source: { kind: 'field', field: 'serverName' }, trim: true, omitWhenEmpty: false },
    { name: 'SERVER_DESCRIPTION', source: { kind: 'field', field: 'serverDescription' }, trim: true, omitWhenEmpty: true },
    { name: 'PLAYERS', source: { kind: 'field', field: 'players' }, fallback: '16', trim: false, omitWhenEmpty: false },
    // Ohne Passwort die Variable ganz weglassen, sonst startet der Server mit
    // einem leeren Passwort statt ohne.
    { name: 'SERVER_PASSWORD', source: { kind: 'field', field: 'serverPassword' }, trim: false, omitWhenEmpty: true },
    // Zugleich das RCON-Passwort; deshalb aus dem Instanzgeheimnis.
    { name: 'ADMIN_PASSWORD', source: { kind: 'rconPassword' }, trim: false, omitWhenEmpty: false },
    { name: 'RCON_ENABLED', source: { kind: 'const', value: 'true' }, trim: false, omitWhenEmpty: false },
    { name: 'RCON_PORT', source: { kind: 'const', value: '25575' }, trim: false, omitWhenEmpty: false },
    { name: 'PORT', source: { kind: 'port', port: 'game' }, fallback: '8211', trim: false, omitWhenEmpty: false },
    { name: 'QUERY_PORT', source: { kind: 'port', port: 'query' }, fallback: '27015', trim: false, omitWhenEmpty: false },
    {
      name: 'COMMUNITY', source: { kind: 'field', field: 'community' },
      boolean: { whenTrue: 'true', whenFalse: 'false' }, trim: false, omitWhenEmpty: false,
    },
    {
      name: 'MULTITHREADING', source: { kind: 'field', field: 'multithreading' },
      boolean: { whenTrue: 'true', whenFalse: 'false' }, trim: false, omitWhenEmpty: false,
    },
    {
      name: 'UPDATE_ON_BOOT', source: { kind: 'field', field: 'updateOnBoot' },
      boolean: { whenTrue: 'true', whenFalse: 'false' }, trim: false, omitWhenEmpty: false,
    },
    { name: 'PUID', source: { kind: 'field', field: 'puid' }, fallback: '1000', trim: false, omitWhenEmpty: false },
    { name: 'PGID', source: { kind: 'field', field: 'pgid' }, fallback: '1000', trim: false, omitWhenEmpty: false },
    { name: 'TZ', source: { kind: 'timezone' }, trim: false, omitWhenEmpty: false },
  ],

  logPatterns: {
    // Palworld baut auf der Unreal Engine; Beitritte meldet deren Netzschicht:
    // `[2026.09.09-12.34.56:789][123]LogNet: Join succeeded: Kai`
    join: { source: 'Join succeeded: (.+)$', flags: '' },
    // Beim Verlassen nennt Unreal nur die EOS-Kennung, keinen Namen. Die
    // Steam-Abfrage gleicht die Liste über die Spielerzahl wieder ab.
    ready: { source: '(Setting breakpad minidump|Running Palworld|is listening)', flags: 'i' },
    clean: {
      pattern: { source: '^\\[[\\d.\\-:]+\\]\\[[ \\d]+\\]', flags: '' },
      replacement: '',
    },
  },

  validations: [
    {
      rule: 'minLength',
      field: 'serverPassword',
      value: 8,
      message: 'Mindestens 8 Zeichen',
      onlyWhenSet: true,
    },
  ],

  adapter: { queryPortName: 'query', rconPortName: 'rcon', maxPlayersField: 'players' },

  fakeLog: {
    timeFormat: 'iso',
    join: '[{time}][123]LogNet: Join succeeded: {name}',
    leave: '[{time}][124]LogNet: UChannel::Close: Sending CloseBunch, UniqueId: EOS:{n}',
    ready: '[{time}][  0]LogPalServer: Running Palworld dedicated server',
    chatter: '[{time}][{n}]LogPal: World save completed',
  },

  modExtensions: [],

  backup: {
    paths: ['/palworld/Pal/Saved'],
    // Vor dem Sichern speichern — sonst fehlt im Backup, was seit dem letzten
    // Autosave passiert ist.
    preCommands: ['Save'],
    postCommands: [],
  },
};

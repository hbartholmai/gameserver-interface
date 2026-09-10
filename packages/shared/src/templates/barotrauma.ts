import type { TemplateDefinition } from '../schema/template-definition.js';

/**
 * Barotrauma auf Basis von `goldfish92/barotrauma-dedicated-server`.
 *
 * Das Image schreibt die Umgebungsvariablen beim Start in
 * `serversettings.xml` — mehr als Name, Passwort, Begrüßung und die
 * Startbedingung kennt es nicht. Alles Weitere wird im Adminmenü des Spiels
 * eingestellt und landet in derselben Datei.
 *
 * Die Spielstände liegen außerhalb des Spielverzeichnisses, im Profilpfad des
 * Herstellers — deshalb das zweite Volume mit dem sperrigen Namen.
 */
export const barotraumaDefinition: TemplateDefinition = {
  id: 'barotrauma',
  label: 'Barotrauma',
  summary: 'U-Boot-Survival. Name und Passwort über Variablen, der Rest im Adminmenü.',
  image: 'goldfish92/barotrauma-dedicated-server',
  defaultTag: 'latest',
  defaultMemoryMb: 4096,
  defaultCpus: 2,
  notes: [
    'Nur Name, Passwort, Begrüßung und die Startbedingung stammen aus den Einstellungen; alles Weitere steht im Adminmenü im Spiel.',
    'Das Image meldet den Server immer öffentlich an — für eine private Runde ein Passwort setzen.',
    'Rechte für Mitspieler vergibt das Spiel über SteamIDs; das Panel führt nur Namen und bietet deshalb kein Kick und kein Bann.',
    'Der Mod-Reiter verwaltet die eigenen U-Boote: .sub-Dateien landen im Volume „submarines“ und erscheinen dann in der Auswahl.',
  ],
  capabilities: {
    console: 'readonly',
    players: 'a2s',
    // Eigene U-Boote sind Dateien in einem Verzeichnis — genau das, was die
    // Mod-Verwaltung kann, seit die Dateiendung aus der Vorlage kommt.
    mods: 'plugins',
    moderation: false,
  },
  ports: [
    { name: 'game', label: 'Spielport', container: 27015, protocol: 'udp', defaultHost: 27015, internalOnly: false },
    { name: 'query', label: 'Steam-Abfrage', container: 27016, protocol: 'udp', defaultHost: 27016, internalOnly: false },
  ],
  volumes: [
    {
      name: 'saves',
      containerPath: '/home/steam/.local/share/Daedalic Entertainment GmbH/Barotrauma/Multiplayer',
      role: 'data',
    },
    { name: 'submarines', containerPath: '/home/steam/barotrauma-dedicated/Submarines/github', role: 'mods' },
  ],
  fields: [
    {
      id: 'serverName', label: 'Servername', type: 'text', default: 'Barotrauma-Server',
      required: true, maxLength: 64, editable: true, restartRequired: true, secret: false,
    },
    {
      id: 'serverMessage', label: 'Begrüßung', type: 'text', default: '',
      required: false, maxLength: 200, editable: true, restartRequired: true, secret: false,
      help: 'Wird Spielern beim Beitritt angezeigt.',
    },
    {
      id: 'serverPassword', label: 'Serverpasswort', type: 'password', default: '',
      required: false, maxLength: 64, editable: true, restartRequired: true, secret: true,
      help: 'Leer lassen für einen offenen Server — der Server steht in jedem Fall öffentlich in der Liste.',
    },
    {
      id: 'startWhenReady', label: 'Starten, wenn bereit', type: 'boolean', default: true,
      required: false, editable: true, restartRequired: true, secret: false,
      help: 'Startet die Runde, sobald der eingestellte Anteil der Spieler bereit ist.',
    },
    {
      id: 'readyRatio', label: 'Anteil bereiter Spieler', type: 'number', default: 1,
      min: 0.1, max: 1, required: true, editable: true, restartRequired: true, secret: false,
      help: '1 bedeutet: alle müssen bereit sein.',
    },
  ],

  env: [
    { name: 'BAR_NAME', source: { kind: 'field', field: 'serverName' }, trim: true, omitWhenEmpty: false },
    { name: 'BAR_SERVERMESSAGE', source: { kind: 'field', field: 'serverMessage' }, trim: true, omitWhenEmpty: false },
    // Das Startskript setzt den Wert per sed in die XML; eine fehlende
    // Variable schriebe dort „password=""“ hinein — leer ist also richtig.
    { name: 'BAR_PASSWORD', source: { kind: 'field', field: 'serverPassword' }, trim: false, omitWhenEmpty: false },
    {
      name: 'BAR_START_WHEN_CLIENTS_READY', source: { kind: 'field', field: 'startWhenReady' },
      boolean: { whenTrue: 'True', whenFalse: 'False' }, trim: false, omitWhenEmpty: false,
    },
    { name: 'BAR_START_WHEN_CLIENTS_READY_RATIO', source: { kind: 'field', field: 'readyRatio' }, fallback: '1.0', trim: false, omitWhenEmpty: false },
    { name: 'TZ', source: { kind: 'timezone' }, trim: false, omitWhenEmpty: false },
  ],

  /*
   * Der Server meldet Beitritt und Abgang im Klartext. Ob der Name in
   * Anführungszeichen steht, hängt an der Fassung — das Muster lässt beides
   * zu. Stimmt es mit einem echten Server nicht überein, hilft die Musterprobe
   * im Vorlagen-Editor.
   */
  logPatterns: {
    join: { source: '"?([^"\\n]+?)"? has joined the server', flags: '' },
    leave: { source: '"?([^"\\n]+?)"? has left the server', flags: '' },
    ready: { source: 'Server started', flags: '' },
  },

  validations: [
    {
      rule: 'minLength', field: 'serverPassword', value: 4,
      message: 'Mindestens 4 Zeichen', onlyWhenSet: true,
    },
  ],

  adapter: { queryPortName: 'query' },

  fakeLog: {
    timeFormat: 'iso',
    join: '{name} has joined the server. ({n})',
    leave: '{name} has left the server. ({n})',
    ready: 'Server started',
    chatter: 'Round {n} started: Europa Ridge',
  },

  modsPath: '/home/steam/barotrauma-dedicated/Submarines/github',
  modExtensions: ['.sub'],

  backup: {
    paths: ['/home/steam/.local/share/Daedalic Entertainment GmbH/Barotrauma/Multiplayer'],
    preCommands: [],
    postCommands: [],
  },
};

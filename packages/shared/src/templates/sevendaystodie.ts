import type { TemplateDefinition } from '../schema/template-definition.js';

/**
 * 7 Days to Die auf Basis von `vinanrra/7dtd-server` (LinuxGSM).
 *
 * **Die Servereinstellungen stehen nicht in der Umgebung.** Das Image kennt
 * Variablen nur für Fassung, Mods und den LinuxGSM-Betrieb; Servername,
 * Slotzahl und Spielregeln liegen in `serverfiles/sdtdserver.xml`. Diese
 * Vorlage bildet deshalb ab, was das Image wirklich steuert — der Rest wird im
 * Serverdateien-Volume bearbeitet.
 *
 * Die Konsole bleibt lesend: 7 Days to Die spricht Telnet, kein Source-RCON.
 * Der Telnet-Port wird veröffentlicht, damit ein eigener Client daran kann.
 */
export const sevenDaysToDieDefinition: TemplateDefinition = {
  id: '7daystodie',
  label: '7 Days to Die',
  summary: 'Zombie-Survival über LinuxGSM. Einstellungen in sdtdserver.xml, Konsole per Telnet.',
  image: 'vinanrra/7dtd-server',
  defaultTag: 'latest',
  defaultMemoryMb: 8192,
  defaultCpus: 4,
  notes: [
    'Servername, Slots und Spielregeln stehen in serverfiles/sdtdserver.xml — das Image kennt dafür keine Variablen.',
    'Die Konsole ist lesend: 7 Days to Die spricht Telnet auf Port 8081, kein Source-RCON. Das Passwort steht ebenfalls in der XML.',
    'Die Weltdaten liegen getrennt von den Serverdateien; gesichert wird nur die Welt.',
    'Mods über BepInEx brauchen den Schalter „BepInEx installieren“ — vorher gibt es kein Plugin-Verzeichnis.',
  ],
  capabilities: {
    console: 'readonly',
    players: 'a2s',
    mods: 'bepinex',
    moderation: false,
  },
  ports: [
    { name: 'game', label: 'Spielport (UDP)', container: 26900, protocol: 'udp', defaultHost: 26900, internalOnly: false },
    { name: 'gametcp', label: 'Spielport (TCP)', container: 26900, protocol: 'tcp', defaultHost: 26900, internalOnly: false },
    { name: 'aux1', label: 'Zusatzport 1', container: 26901, protocol: 'udp', defaultHost: 26901, internalOnly: false },
    { name: 'aux2', label: 'Zusatzport 2', container: 26902, protocol: 'udp', defaultHost: 26902, internalOnly: false },
    { name: 'webadmin', label: 'Weboberfläche', container: 8080, protocol: 'tcp', defaultHost: 8080, internalOnly: false },
    { name: 'telnet', label: 'Telnet', container: 8081, protocol: 'tcp', defaultHost: 8081, internalOnly: false },
  ],
  volumes: [
    { name: 'saves', containerPath: '/home/sdtdserver/.local/share/7DaysToDie', role: 'data' },
    { name: 'serverfiles', containerPath: '/home/sdtdserver/serverfiles', role: 'config' },
  ],
  fields: [
    {
      id: 'version', label: 'Spielfassung', type: 'text', default: 'stable',
      required: true, maxLength: 32, editable: true, restartRequired: true, secret: false,
      help: 'Steam-Zweig, etwa stable oder latest_experimental.',
    },
    {
      id: 'monitor', label: 'Nach Absturz neu starten', type: 'boolean', default: true,
      required: false, editable: true, restartRequired: true, secret: false,
      help: 'LinuxGSM überwacht den Server und startet ihn wieder.',
    },
    {
      id: 'updateMods', label: 'Mods beim Start aktualisieren', type: 'boolean', default: false,
      required: false, editable: true, restartRequired: true, secret: false,
      help: 'Verlängert jeden Start spürbar.',
    },
    {
      id: 'allocFixes', label: 'Allocs Fixes installieren', type: 'boolean', default: false,
      required: false, editable: true, restartRequired: true, secret: false,
      help: 'Serverwerkzeuge samt Kartenansicht im Browser.',
    },
    {
      id: 'cpm', label: 'CPM installieren', type: 'boolean', default: false,
      required: false, editable: true, restartRequired: true, secret: false,
      help: 'Verwaltungsmod; zieht Allocs Fixes mit.',
    },
    {
      id: 'bepinex', label: 'BepInEx installieren', type: 'boolean', default: false,
      required: false, editable: true, restartRequired: true, secret: false,
      help: 'Nötig, damit hochgeladene .dll-Plugins geladen werden.',
    },
    {
      id: 'darknessFalls', label: 'Darkness Falls installieren', type: 'boolean', default: false,
      required: false, editable: true, restartRequired: true, secret: false,
      help: 'Große Überarbeitung. Nicht zusammen mit Undead Legacy.',
    },
    {
      id: 'undeadLegacy', label: 'Undead Legacy installieren', type: 'boolean', default: false,
      required: false, editable: true, restartRequired: true, secret: false,
      help: 'Große Überarbeitung. Nicht zusammen mit Darkness Falls.',
    },
    {
      id: 'modsUrls', label: 'Mod-Adressen', type: 'text', default: '',
      required: false, maxLength: 500, editable: true, restartRequired: true, secret: false,
      help: 'ZIP- oder RAR-Adressen, durch Komma getrennt.',
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
    // 1 heißt: installieren, aktualisieren und starten. Ohne diese Variable
    // startet der Container gar nicht.
    { name: 'START_MODE', source: { kind: 'const', value: '1' }, trim: false, omitWhenEmpty: false },
    { name: 'VERSION', source: { kind: 'field', field: 'version' }, trim: true, omitWhenEmpty: false },
    {
      name: 'MONITOR', source: { kind: 'field', field: 'monitor' },
      boolean: { whenTrue: 'YES', whenFalse: 'NO' }, trim: false, omitWhenEmpty: false,
    },
    {
      name: 'UPDATE_MODS', source: { kind: 'field', field: 'updateMods' },
      boolean: { whenTrue: 'YES', whenFalse: 'NO' }, trim: false, omitWhenEmpty: false,
    },
    {
      name: 'ALLOC_FIXES', source: { kind: 'field', field: 'allocFixes' },
      boolean: { whenTrue: 'YES', whenFalse: 'NO' }, trim: false, omitWhenEmpty: false,
    },
    {
      name: 'CPM', source: { kind: 'field', field: 'cpm' },
      boolean: { whenTrue: 'YES', whenFalse: 'NO' }, trim: false, omitWhenEmpty: false,
    },
    {
      name: 'BEPINEX', source: { kind: 'field', field: 'bepinex' },
      boolean: { whenTrue: 'YES', whenFalse: 'NO' }, trim: false, omitWhenEmpty: false,
    },
    {
      name: 'DARKNESS_FALLS', source: { kind: 'field', field: 'darknessFalls' },
      boolean: { whenTrue: 'YES', whenFalse: 'NO' }, trim: false, omitWhenEmpty: false,
    },
    {
      name: 'UNDEAD_LEGACY', source: { kind: 'field', field: 'undeadLegacy' },
      boolean: { whenTrue: 'YES', whenFalse: 'NO' }, trim: false, omitWhenEmpty: false,
    },
    { name: 'MODS_URLS', source: { kind: 'field', field: 'modsUrls' }, trim: true, omitWhenEmpty: true },
    // Das Panel sichert selbst; die eigene Sicherung des Images liefe daneben.
    { name: 'BACKUP', source: { kind: 'const', value: 'NO' }, trim: false, omitWhenEmpty: false },
    { name: 'PUID', source: { kind: 'field', field: 'puid' }, fallback: '1000', trim: false, omitWhenEmpty: false },
    { name: 'PGID', source: { kind: 'field', field: 'pgid' }, fallback: '1000', trim: false, omitWhenEmpty: false },
    // Das Image liest die Zeitzone unter eigenem Namen, nicht als TZ.
    { name: 'TimeZone', source: { kind: 'timezone' }, trim: false, omitWhenEmpty: false },
  ],

  /*
   * Die Serverkonsole meldet:
   * `2026-09-09T12:34:56 42.123 INF Player connected, entityid=171, name=Kai, …`
   * `… INF Player disconnected: EntityID=171, …, PlayerName='Kai'`
   */
  logPatterns: {
    join: { source: 'Player connected,.*?name=([^,]+)', flags: '' },
    leave: { source: "Player disconnected:.*PlayerName='([^']+)'", flags: '' },
    ready: { source: 'StartGame done', flags: '' },
    clean: { pattern: { source: '^[\\d-]+[T ][\\d:]+ [\\d.]+ ', flags: '' }, replacement: '' },
  },

  validations: [],

  adapter: { queryPortName: 'game' },

  fakeLog: {
    timeFormat: 'iso',
    join: '{time} {n}.123 INF Player connected, entityid={n}, name={name}, pltfmid=Steam_76561198000000000, ip=10.0.0.5',
    leave: "{time} {n}.456 INF Player disconnected: EntityID={n}, PlayerID='Steam_76561198000000000', PlayerName='{name}'",
    ready: '{time} 0.000 INF StartGame done',
    chatter: '{time} {n}.000 INF Time: 12.34m FPS: 60.00 Heap: 1024.0MB',
  },

  modsPath: '/home/sdtdserver/serverfiles/BepInEx/plugins',
  modExtensions: ['.dll'],

  backup: {
    // Die Welt, nicht die Serverdateien: die lädt LinuxGSM jederzeit neu.
    paths: ['/home/sdtdserver/.local/share/7DaysToDie/Saves'],
    preCommands: [],
    postCommands: [],
  },
};

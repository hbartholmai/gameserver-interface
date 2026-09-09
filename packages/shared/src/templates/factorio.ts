import type { TemplateDefinition } from '../schema/template-definition.js';

/**
 * Factorio auf Basis von `factoriotools/factorio`.
 *
 * Zwei Eigenheiten, die den Zuschnitt bestimmen:
 *
 * - Der Server **hat** RCON, aber das Passwort steht in der Datei `rconpw` im
 *   Volume und wird zufällig erzeugt; eine Umgebungsvariable dafür gibt es
 *   nicht. Das Panel kann es also nicht setzen und sich nicht verbinden —
 *   deshalb `console: 'readonly'`. Wer RCON braucht, nutzt
 *   `docker exec <container> rcon <befehl>` direkt.
 * - Ein Spielstand entsteht erst beim ersten Start. `GENERATE_NEW_SAVE=true`
 *   erzeugt ihn; danach lädt der Server standardmäßig den neuesten.
 *
 * Umgebungsvariablen belegt über die Tabelle in der Docker-Hub-Beschreibung,
 * Log-Format über die Foren-Belege zum `[JOIN]`/`[LEAVE]`-Präfix (seit 0.15).
 */
export const factorioDefinition: TemplateDefinition = {
  id: 'factorio',
  label: 'Factorio',
  summary: 'Dedizierter Factorio-Server mit Mod-Verwaltung und automatischer Aktualisierung. Konsole nur lesend.',
  image: 'factoriotools/factorio',
  defaultTag: 'stable',
  defaultMemoryMb: 4096,
  defaultCpus: 2,
  notes: [
    'Beim ersten Start „Neue Karte erzeugen“ anlassen — ohne Spielstand startet der Server nicht.',
    'Factorio erzeugt sein RCON-Passwort selbst in der Datei `rconpw`; das Panel kann es nicht setzen, die Konsole ist deshalb nur lesend.',
    'Mods aktualisieren sich beim Start nur mit hinterlegtem factorio.com-Konto (Benutzername und Token).',
  ],
  capabilities: {
    console: 'readonly',
    players: 'log',
    mods: 'plugins',
    moderation: false,
  },
  ports: [
    { name: 'game', label: 'Spielport', container: 34197, protocol: 'udp', defaultHost: 34197, internalOnly: false },
  ],
  volumes: [{ name: 'data', containerPath: '/factorio', role: 'data' }],
  fields: [
    {
      id: 'saveName', label: 'Name des Spielstands', type: 'text', default: 'welt',
      required: true, maxLength: 40, editable: false, restartRequired: true, secret: false,
      help: 'Dateiname ohne .zip im Verzeichnis saves — nach dem Anlegen nicht mehr änderbar.',
    },
    {
      id: 'generateNewSave', label: 'Neue Karte erzeugen', type: 'boolean', default: true,
      required: false, editable: true, restartRequired: true, secret: false,
      help: 'Legt den Spielstand an, falls er fehlt. Beim ersten Start nötig.',
    },
    {
      id: 'loadLatestSave', label: 'Neuesten Spielstand laden', type: 'boolean', default: false,
      required: false, editable: true, restartRequired: true, secret: false,
      help: 'An: der jeweils neueste Stand wird geladen. Aus: der oben benannte.',
    },
    {
      id: 'preset', label: 'Kartenvorgabe', type: 'select', default: '',
      options: [
        { value: '', label: 'Standard' },
        { value: 'rich-resources', label: 'reiche Vorkommen' },
        { value: 'marathon', label: 'Marathon' },
        { value: 'death-world', label: 'Todeswelt' },
        { value: 'death-world-marathon', label: 'Todeswelt Marathon' },
      ],
      required: false, editable: false, restartRequired: true, secret: false,
      help: 'Gilt nur, wenn eine neue Karte erzeugt wird.',
    },
    {
      id: 'dlcSpaceAge', label: 'Space Age (DLC)', type: 'boolean', default: true,
      required: false, editable: true, restartRequired: true, secret: false,
      help: 'Aktiviert die Mods der Erweiterung. Ohne das DLC ausschalten.',
    },
    {
      id: 'updateMods', label: 'Mods beim Start aktualisieren', type: 'boolean', default: false,
      required: false, editable: true, restartRequired: true, secret: false,
      help: 'Braucht Benutzername und Token; sonst startet der Server nicht.',
    },
    {
      id: 'username', label: 'factorio.com-Benutzer', type: 'text', default: '',
      required: false, maxLength: 64, editable: true, restartRequired: true, secret: false,
      help: 'Nur für Mod-Aktualisierung und öffentliche Listung.',
    },
    {
      id: 'token', label: 'factorio.com-Token', type: 'password', default: '',
      required: false, maxLength: 64, editable: true, restartRequired: true, secret: true,
      help: 'Aus dem Profil auf factorio.com — nicht das Kennwort.',
    },
  ],

  env: [
    { name: 'SAVE_NAME', source: { kind: 'field', field: 'saveName' }, fallback: 'welt', trim: true, omitWhenEmpty: false },
    {
      name: 'GENERATE_NEW_SAVE', source: { kind: 'field', field: 'generateNewSave' },
      boolean: { whenTrue: 'true', whenFalse: 'false' }, fallback: 'true', trim: false, omitWhenEmpty: false,
    },
    {
      name: 'LOAD_LATEST_SAVE', source: { kind: 'field', field: 'loadLatestSave' },
      boolean: { whenTrue: 'true', whenFalse: 'false' }, fallback: 'false', trim: false, omitWhenEmpty: false,
    },
    { name: 'PORT', source: { kind: 'port', port: 'game' }, fallback: '34197', trim: false, omitWhenEmpty: false },
    {
      name: 'DLC_SPACE_AGE', source: { kind: 'field', field: 'dlcSpaceAge' },
      boolean: { whenTrue: 'true', whenFalse: 'false' }, fallback: 'true', trim: false, omitWhenEmpty: false,
    },
    {
      name: 'UPDATE_MODS_ON_START', source: { kind: 'field', field: 'updateMods' },
      boolean: { whenTrue: 'true', whenFalse: 'false' }, fallback: 'false', trim: false, omitWhenEmpty: false,
    },
    { name: 'TZ', source: { kind: 'timezone' }, trim: false, omitWhenEmpty: false },
    // Leere Vorgabe bedeutet Standardkarte; die Variable darf dann nicht gesetzt sein.
    { name: 'PRESET', source: { kind: 'field', field: 'preset' }, trim: true, omitWhenEmpty: true },
    { name: 'USERNAME', source: { kind: 'field', field: 'username' }, trim: true, omitWhenEmpty: true },
    { name: 'TOKEN', source: { kind: 'field', field: 'token' }, trim: true, omitWhenEmpty: true },
  ],

  logPatterns: {
    // `2026-09-09 20:05:08 [JOIN] Spielername joined the game`
    join: { source: '\\[JOIN\\] (\\S+) joined the game', flags: '' },
    leave: { source: '\\[LEAVE\\] (\\S+) left the game', flags: '' },
    ready: { source: '(Hosting game at|changing state from\\(CreatingGame\\) to\\(InGame\\))', flags: '' },
    clean: {
      pattern: { source: '^\\s*\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2} ', flags: '' },
      replacement: '',
    },
  },

  validations: [
    {
      rule: 'pattern',
      field: 'saveName',
      pattern: { source: '^[A-Za-z0-9_.-]+$', flags: '' },
      message: 'Nur Buchstaben, Ziffern und . _ -',
      onlyWhenSet: true,
    },
  ],

  adapter: {},

  fakeLog: {
    timeFormat: 'iso',
    join: '{time} [JOIN] {name} joined the game',
    leave: '{time} [LEAVE] {name} left the game',
    ready: '{time} Hosting game at IP ADDR:({0.0.0.0:34197})',
    chatter: '{time} Info AppManager.cpp:315: Saving finished ({n} ms)',
  },

  modsPath: '/factorio/mods',
  modExtensions: ['.zip'],

  backup: {
    paths: ['/factorio/saves'],
    preCommands: [],
    postCommands: [],
  },
};

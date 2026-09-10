import type { TemplateDefinition } from '../schema/template-definition.js';

/**
 * Luanti (früher Minetest) auf Basis von `linuxserver/luanti`.
 *
 * **Nicht `linuxserver/minetest`.** LinuxServer hat das Image mit der
 * Umbenennung des Spiels stillgelegt: sein `latest` zeigt auf eine Manifestliste
 * ohne amd64-Eintrag, `docker run` scheitert dort mit „no matching manifest for
 * linux/amd64“. Der letzte lauffähige Stand wäre `5.10.0` — der startet zwar,
 * bringt aber kein Spiel mit und geht in eine Neustartschleife
 * („you need to select a game using the '--gameid' argument“).
 * `linuxserver/luanti` läuft ohne Zutun und bringt `devtest` mit.
 *
 * **Diese Vorlage hat bewusst wenige Felder.** Das Image kennt nur vier
 * Umgebungsvariablen — `PUID`, `PGID`, `TZ` und `CLI_ARGS`; die eigentliche
 * Konfiguration steht in `minetest.conf` im Volume. Der Server erzeugt die
 * Datei beim ersten Start; danach wird sie von Hand oder im Spiel bearbeitet.
 *
 * `CLI_ARGS` ist deshalb als Freitextfeld durchgereicht: darüber lassen sich
 * Spiel-ID, Weltname und Port setzen, ohne dass das Panel eine Konfigurationsdatei
 * schreiben müsste.
 *
 * Luanti spricht kein RCON; Spielernamen kommen aus den `ACTION[Server]`-Zeilen
 * des Logs. Mods liegen im Volume unter `mods/` und werden im Spiel verwaltet,
 * nicht als einzelne Dateien — deshalb `mods: 'none'`.
 */
export const luantiDefinition: TemplateDefinition = {
  id: 'luanti',
  label: 'Luanti (Minetest)',
  summary: 'Freier Voxel-Spielbaukasten. Konfiguration über minetest.conf im Volume, Konsole nur lesend.',
  image: 'linuxserver/luanti',
  defaultTag: 'latest',
  defaultMemoryMb: 2048,
  defaultCpus: 2,
  notes: [
    'Luanti wird über die Datei minetest.conf im Datenverzeichnis eingerichtet — der Server legt sie beim ersten Start an.',
    'Mitgeliefert ist nur „devtest“, das Testspiel der Entwickler. Ein richtiges Spiel (etwa VoxeLibre) gehört ins Datenverzeichnis unter games/ und wird über „Startargumente“ gewählt: --gameid <name> --world /config/.minetest/worlds/welt',
    'Mods werden im Spiel verwaltet und liegen im Datenverzeichnis; der Mod-Reiter des Panels bleibt deshalb leer.',
  ],
  capabilities: {
    console: 'readonly',
    players: 'log',
    mods: 'none',
    moderation: false,
  },
  ports: [
    { name: 'game', label: 'Spielport', container: 30000, protocol: 'udp', defaultHost: 30000, internalOnly: false },
  ],
  volumes: [{ name: 'config', containerPath: '/config/.minetest', role: 'data' }],
  fields: [
    {
      id: 'cliArgs', label: 'Startargumente', type: 'text', default: '',
      required: false, maxLength: 200, editable: true, restartRequired: true, secret: false,
      help: 'Wird unverändert an den Server durchgereicht, etwa --gameid minetest_game. Leer lassen für die Vorgabe des Images.',
    },
    {
      id: 'puid', label: 'Benutzer-ID', type: 'number', default: 1000,
      min: 0, max: 65535, required: true, editable: true, restartRequired: true, secret: false,
      help: 'Muss dem Eigentümer des Datenverzeichnisses auf dem Host entsprechen, sonst darf der Server nicht schreiben.',
    },
    {
      id: 'pgid', label: 'Gruppen-ID', type: 'number', default: 1000,
      min: 0, max: 65535, required: true, editable: true, restartRequired: true, secret: false,
    },
  ],

  env: [
    { name: 'PUID', source: { kind: 'field', field: 'puid' }, fallback: '1000', trim: false, omitWhenEmpty: false },
    { name: 'PGID', source: { kind: 'field', field: 'pgid' }, fallback: '1000', trim: false, omitWhenEmpty: false },
    { name: 'TZ', source: { kind: 'timezone' }, trim: false, omitWhenEmpty: false },
    // Ohne Argumente die Vorgabe des Images belassen.
    { name: 'CLI_ARGS', source: { kind: 'field', field: 'cliArgs' }, trim: true, omitWhenEmpty: true },
  ],

  logPatterns: {
    // `2026-09-09 12:34:56: ACTION[Server]: Kai joins game. List of players: Kai`
    join: { source: 'ACTION\\[Server\\]: (\\S+) joins game', flags: '' },
    leave: { source: 'ACTION\\[Server\\]: (\\S+) leaves game', flags: '' },
    ready: { source: '(Server for gameid|listening on|Using gameid)', flags: 'i' },
    clean: {
      pattern: { source: '^\\s*\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}:?\\s*', flags: '' },
      replacement: '',
    },
  },

  validations: [],
  adapter: {},

  fakeLog: {
    timeFormat: 'iso',
    join: '{time}: ACTION[Server]: {name} joins game. List of players: {name}',
    leave: '{time}: ACTION[Server]: {name} leaves game. List of players:',
    ready: '{time}: ACTION[Server]: Server for gameid="minetest_game" listening on 0.0.0.0:30000',
    chatter: '{time}: ACTION[Server]: Saving map to disk ({n} ms)',
  },

  modExtensions: [],

  /*
   * Das Image startet ohne `--world` und nimmt dann `worlds/world` — belegt am
   * Log: `World at [/config/.minetest/worlds/world]`. Wer über die
   * Startargumente eine andere Welt wählt, greift daneben; das steht in den
   * Hinweisen der Vorlage.
   */
  world: {
    parent: '/config/.minetest/worlds',
    name: { kind: 'const', value: 'world' },
    parts: [{ suffix: '', type: 'dir', required: true }],
    markers: ['world.mt'],
    accept: [],
  },

  backup: {
    paths: ['/config/.minetest/worlds'],
    preCommands: [],
    postCommands: [],
  },
};

import type { TemplateDefinition } from '../schema/template-definition.js';

/**
 * Don't Starve Together auf Basis von `jamesits/dst-server`.
 *
 * **Fast alles steht in Dateien, nicht in der Umgebung.** Klei richtet den
 * Server über `cluster.ini` und die `server.ini` der Shards ein; das Image
 * legt beim ersten Start Vorlagen davon im Datenverzeichnis ab. Die Vorlage
 * setzt deshalb nur, was das Image wirklich als Variable kennt — das
 * Cluster-Token, ohne das der Server sich nicht anmeldet.
 *
 * Zwei Shards teilen sich einen Container: Oberwelt (10999) und Höhlen
 * (11000). Dazu die beiden Steam-Ports, die nicht umgemappt werden dürfen.
 */
export const dstDefinition: TemplateDefinition = {
  id: 'dst',
  label: "Don't Starve Together",
  summary: 'Klei-Survival als Cluster mit Höhlen. Eingerichtet über cluster.ini im Datenverzeichnis.',
  image: 'jamesits/dst-server',
  defaultTag: 'latest',
  defaultMemoryMb: 2048,
  defaultCpus: 2,
  notes: [
    'Servername, Passwort, Spielmodus und Slots stehen in DoNotStarveTogether/Cluster_1/cluster.ini im Datenverzeichnis — das Image kennt dafür keine Variablen.',
    'Ohne Cluster-Token startet der Server nicht. Zu holen im Spiel unter „Konto“ → „Spielserver“.',
    'Die Steam-Ports 12346 und 12347 dürfen nicht auf andere Nummern umgebogen werden, sonst findet niemand den Server.',
    'Mods werden in mods/dedicated_server_mods_setup.lua eingetragen, nicht als Datei hochgeladen.',
  ],
  capabilities: {
    console: 'readonly',
    players: 'log',
    mods: 'none',
    moderation: false,
  },
  ports: [
    { name: 'master', label: 'Oberwelt', container: 10999, protocol: 'udp', defaultHost: 10999, internalOnly: false },
    { name: 'caves', label: 'Höhlen', container: 11000, protocol: 'udp', defaultHost: 11000, internalOnly: false },
    { name: 'steam1', label: 'Steam 1', container: 12346, protocol: 'udp', defaultHost: 12346, internalOnly: false },
    { name: 'steam2', label: 'Steam 2', container: 12347, protocol: 'udp', defaultHost: 12347, internalOnly: false },
  ],
  volumes: [{ name: 'data', containerPath: '/data', role: 'config' }],
  fields: [
    {
      id: 'clusterToken', label: 'Cluster-Token', type: 'password', default: '',
      required: true, maxLength: 200, editable: true, restartRequired: true, secret: true,
      help: 'Im Spiel unter „Konto“ → „Spielserver“ erzeugen. Beginnt mit pds-g^.',
    },
    {
      id: 'arch', label: 'Architektur', type: 'select', default: 'amd64',
      options: [
        { value: 'amd64', label: 'amd64 (64 Bit)' },
        { value: 'x86', label: 'x86 (32 Bit)' },
      ],
      required: true, editable: true, restartRequired: true, secret: false,
      help: 'Nur ändern, wenn der Server auf dieser Maschine nicht startet.',
    },
  ],

  env: [
    { name: 'DST_CLUSTER_TOKEN', source: { kind: 'field', field: 'clusterToken' }, trim: true, omitWhenEmpty: false },
    { name: 'DST_SERVER_ARCH', source: { kind: 'field', field: 'arch' }, trim: false, omitWhenEmpty: false },
    { name: 'TZ', source: { kind: 'timezone' }, trim: false, omitWhenEmpty: false },
  ],

  /*
   * Klei protokolliert Beitritt und Abgang als eigene Ankündigungen:
   * `[00:01:23]: [Join Announcement] Kai`
   */
  logPatterns: {
    join: { source: '\\[Join Announcement\\] (.+)$', flags: '' },
    leave: { source: '\\[Leave Announcement\\] (.+)$', flags: '' },
    ready: { source: '(Sim paused|Telling Client our new session identifier)', flags: '' },
    clean: { pattern: { source: '^\\[[\\d:]+\\]:\\s*', flags: '' }, replacement: '' },
  },

  validations: [
    {
      rule: 'minLength', field: 'clusterToken', value: 20,
      message: 'Das Token ist deutlich länger — vermutlich unvollständig kopiert', onlyWhenSet: false,
    },
  ],

  adapter: {},

  fakeLog: {
    timeFormat: 'hms',
    join: '[{time}]: [Join Announcement] {name}',
    leave: '[{time}]: [Leave Announcement] {name}',
    ready: '[{time}]: Sim paused',
    chatter: '[{time}]: Serializing world: session/ABCDEF/{n}',
  },

  modExtensions: [],

  backup: {
    paths: ['/data/DoNotStarveTogether'],
    preCommands: [],
    postCommands: [],
  },
};

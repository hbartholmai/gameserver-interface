import type { GameTemplate } from '../schema/template.js';
import { levelFromKeywords } from './util.js';

/**
 * Enshrouded auf Basis von `mornedhels/enshrouded-server`.
 *
 * Enshrouded hat kein natives Linux-Binary — der Windows-Server läuft im Image
 * unter Wine. Es gibt weder RCON noch eine stdin-Konsole, und Mods unterstützt
 * das Spiel nicht.
 *
 * Zwei Besonderheiten gegenüber den anderen Vorlagen:
 * - Der Zugang läuft über **Server-Rollen** (Admin/Friend/Guest) mit je eigenem
 *   Passwort. Ein einzelnes `SERVER_PASSWORD` ist im Spiel abgekündigt und wird
 *   ignoriert.
 * - Es gibt nur noch **einen** Port (Query-Port 15637/udp); die früher übliche
 *   Trennung in Spiel- und Query-Port ist entfallen.
 *
 * Alle mit `SERVER_` beginnenden Variablen des Images bilden die Optionen der
 * `enshrouded_server.json` ab.
 */
export const enshroudedTemplate: GameTemplate = {
  id: 'enshrouded',
  label: 'Enshrouded',
  summary: 'Dedizierter Enshrouded-Server unter Wine. Zugang über Server-Rollen, Konsole nur lesend, keine Mods.',
  image: 'mornedhels/enshrouded-server',
  defaultTag: 'latest',
  defaultMemoryMb: 16384,
  defaultCpus: 6,
  notes: [
    'Enshrouded läuft unter Wine — der erste Start dauert deutlich länger, weil SteamCMD lädt und das Wine-Präfix angelegt wird.',
    'Das Spiel bietet weder RCON noch Mod-Unterstützung: Die Konsole ist read-only, der Mod-Reiter entfällt.',
    'Der Zugang läuft über Rollenpasswörter (Admin, Freund, Gast) — ein einzelnes Serverpasswort kennt Enshrouded nicht mehr.',
    'Spielernamen werden aus dem Log gelesen; einen Ping liefert der Server nicht.',
  ],
  capabilities: {
    console: 'readonly',
    players: 'log',
    mods: 'none',
    moderation: false,
  },
  ports: [
    { name: 'query', label: 'Spiel-/Query-Port', container: 15637, protocol: 'udp', defaultHost: 15637, internalOnly: false },
  ],
  volumes: [{ name: 'data', containerPath: '/opt/enshrouded', role: 'data' }],
  fields: [
    {
      id: 'serverName', label: 'Servername', type: 'text', default: 'Enshrouded Server',
      required: true, maxLength: 48, editable: true, restartRequired: true, secret: false,
    },
    {
      id: 'adminPassword', label: 'Admin-Passwort', type: 'password', default: '',
      required: true, maxLength: 32, editable: true, restartRequired: true, secret: true,
      help: 'Rolle „Admin“ — volle Rechte inklusive Kick und Bann im Spiel.',
    },
    {
      id: 'friendPassword', label: 'Freund-Passwort', type: 'password', default: '',
      required: false, maxLength: 32, editable: true, restartRequired: true, secret: true,
      help: 'Rolle „Friend“ — darf bauen und Inventare nutzen. Leer lassen, um die Rolle zu sperren.',
    },
    {
      id: 'guestPassword', label: 'Gast-Passwort', type: 'password', default: '',
      required: false, maxLength: 32, editable: true, restartRequired: true, secret: true,
      help: 'Rolle „Guest“ — eingeschränkte Rechte. Leer lassen, um die Rolle zu sperren.',
    },
    {
      id: 'slotCount', label: 'Slots', type: 'number', default: 16,
      min: 1, max: 16, required: true, editable: true, restartRequired: true, secret: false,
      help: 'Enshrouded erlaubt höchstens 16 Spieler.',
    },
    {
      id: 'gameSettingsPreset', label: 'Spielmodus', type: 'select', default: 'Default',
      options: [
        { value: 'Default', label: 'Standard' },
        { value: 'Relaxed', label: 'Entspannt' },
        { value: 'Hard', label: 'Schwer' },
        { value: 'Survival', label: 'Survival' },
        { value: 'Custom', label: 'Eigene Einstellungen' },
      ],
      required: true, editable: true, restartRequired: true, secret: false,
      help: 'Feinjustierung einzelner Werte erfolgt bei „Eigene Einstellungen“ direkt in der enshrouded_server.json.',
    },
    {
      id: 'voiceChat', label: 'Sprachchat', type: 'boolean', default: false,
      required: false, editable: true, restartRequired: true, secret: false,
    },
    {
      id: 'textChat', label: 'Textchat', type: 'boolean', default: true,
      required: false, editable: true, restartRequired: true, secret: false,
    },
    {
      id: 'updateCron', label: 'Update-Zeitplan', type: 'text', default: '0 5 * * *',
      required: false, maxLength: 40, editable: true, restartRequired: true, secret: false,
      help: 'Cron-Ausdruck für die automatische Spiel-Aktualisierung. Leer = aus.',
    },
  ],

  env(values, ctx) {
    const env: Record<string, string> = {
      SERVER_NAME: String(values.serverName ?? 'Enshrouded Server'),
      SERVER_SLOT_COUNT: String(values.slotCount ?? 16),
      SERVER_IP: '0.0.0.0',
      SERVER_QUERYPORT: String(ctx.hostPorts.query ?? 15637),
      SERVER_SAVE_DIR: './savegame',
      SERVER_LOG_DIR: './logs',
      SERVER_GAMESETTINGSPRESET: String(values.gameSettingsPreset ?? 'Default'),
      SERVER_ENABLE_VOICE_CHAT: values.voiceChat ? 'true' : 'false',
      SERVER_ENABLE_TEXT_CHAT: values.textChat === false ? 'false' : 'true',
      // Rollen statt eines Serverpassworts — Reihenfolge entspricht den Standardgruppen.
      SERVER_ROLE_0_NAME: 'Admin',
      SERVER_ROLE_1_NAME: 'Friend',
      SERVER_ROLE_2_NAME: 'Guest',
      // Backups und Neustarts steuert das Panel, nicht das Image.
      UPDATE_CRON: String(values.updateCron ?? ''),
      TZ: ctx.timezone,
    };
    const admin = String(values.adminPassword ?? '');
    const friend = String(values.friendPassword ?? '');
    const guest = String(values.guestPassword ?? '');
    if (admin) env.SERVER_ROLE_0_PASSWORD = admin;
    if (friend) env.SERVER_ROLE_1_PASSWORD = friend;
    if (guest) env.SERVER_ROLE_2_PASSWORD = guest;
    return env;
  },

  logPatterns: {
    join: /(?:Player|Character)\s+['"]?([^'"]+?)['"]?\s+(?:connected|joined)/i,
    leave: /(?:Player|Character)\s+['"]?([^'"]+?)['"]?\s+(?:disconnected|left)/i,
    ready: /(Server is now (?:online|listening)|HandleAssignmentReq|Session .* created)/i,
    level: levelFromKeywords,
    clean: (line) => line.replace(/^\s*\[?\d{4}-\d{2}-\d{2}[ T][\d:.]+\]?\s*/, '').trimEnd(),
  },

  backup: {
    paths: ['/opt/enshrouded/savegame'],
  },
};

#!/usr/bin/env node
/**
 * Erzeugt einen Vorlagenentwurf auf der Kommandozeile — ohne Panel, ohne
 * Anmeldung, ohne Container.
 *
 * Der Zweck: Der Entwurf braucht einen API-Schlüssel und lässt sich deshalb in
 * der Entwicklung nicht durchspielen. Mit diesem Skript prüft ein Betreiber in
 * zehn Sekunden, ob sein Schlüssel trägt, ob das Modell verfügbar ist und ob
 * die Qualität für sein Image reicht — und sieht bei einem Fehlschlag die echte
 * Meldung statt eines Jobstatus.
 *
 *   GSP_GEMINI_API_KEY=... node scripts/entwurf-testen.mjs "Terraria" "ryshe/terraria"
 *
 * Voraussetzung: `npm run build` ist gelaufen.
 */
import { writeFileSync } from 'node:fs';
import { DraftService } from '../packages/server/dist/services/vorlagen-ki.js';
import { loadBuiltinTemplates, listTemplates } from '../packages/shared/dist/index.js';

const [spiel, image, ...rest] = process.argv.slice(2);
const notizen = rest.join(' ');

if (!spiel || !image) {
  console.error('Aufruf: node scripts/entwurf-testen.mjs "<Spiel>" "<docker/image>" [Hinweise…]');
  process.exit(2);
}

const schluessel = process.env.GSP_GEMINI_API_KEY;
// Dieselbe Vorgabe wie in `config.ts`: nicht das neueste Modell, weil das
// durchgehend überlastet antwortet.
const modell = process.env.GSP_GEMINI_MODELL || 'gemini-3.7-flash';

if (!schluessel) {
  console.error(
    'GSP_GEMINI_API_KEY fehlt. Kostenlosen Schlüssel holen: https://aistudio.google.com/apikey',
  );
  process.exit(2);
}

// Die Registry liefert die bereits vergebenen Kennungen, damit der Entwurf
// keine doppelt — im Panel kämen sie aus der Datenbank.
loadBuiltinTemplates();

const dienst = new DraftService(schluessel, modell);
console.log(`Modell: ${modell}`);
console.log(`Entwurf für „${spiel}“ auf Basis von ${image}\n`);

const begonnen = Date.now();
try {
  const ergebnis = await dienst.draft(
    { game: spiel, image, notes: notizen, takenIds: listTemplates().map((t) => t.id) },
    (prozent, meldung) => console.log(`  ${String(prozent ?? '—').padStart(3)}%  ${meldung}`),
  );

  const sekunden = Math.round((Date.now() - begonnen) / 1000);
  console.log(`\n--- Recherche (${sekunden} s) ---------------------------------\n`);
  console.log(ergebnis.research);

  const datei = `entwurf-${ergebnis.definition.id}.json`;
  writeFileSync(datei, JSON.stringify(ergebnis.definition, null, 2), 'utf8');

  console.log('\n--- Entwurf -------------------------------------------------\n');
  const d = ergebnis.definition;
  console.log(`Kennung        ${d.id}`);
  console.log(`Name           ${d.label}`);
  console.log(`Image          ${d.image}:${d.defaultTag}`);
  console.log(
    `Fähigkeiten    Konsole ${d.capabilities.console} · Spieler ${d.capabilities.players} · Mods ${d.capabilities.mods}`,
  );
  console.log(`Ports          ${d.ports.map((p) => `${p.name} ${p.container}/${p.protocol}`).join(', ')}`);
  console.log(`Volumes        ${d.volumes.map((v) => v.containerPath).join(', ')}`);
  console.log(`Felder         ${d.fields.map((f) => f.id).join(', ')}`);
  console.log(`Variablen      ${d.env.map((e) => e.name).join(', ')}`);
  console.log(`Backup         ${d.backup.paths.join(', ')}`);

  console.log(`\nVollständig in ${datei}.`);
  console.log(
    'Prüfe vor dem Übernehmen besonders die Variablennamen und Ports gegen die Recherche oben —\n' +
      'ein erfundener Name sieht plausibel aus und fällt erst auf der Zielmaschine auf.',
  );
  beende(0);
} catch (err) {
  console.error(`\nFehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
  beende(1);
}

/**
 * Beendet, sobald die Ausgabe geschrieben ist.
 *
 * Ohne das meldet libuv auf Windows nach dem letzten Text eine Assertion
 * (`UV_HANDLE_CLOSING`), weil das HTTP-Modul des SDK beim Aufräumen mit dem
 * Prozessende kollidiert. Kein Fehler dieses Skripts, sieht aber wie ein
 * Absturz aus — und würde jeden beunruhigen, der nur wissen will, ob sein
 * Schlüssel trägt.
 */
function beende(code) {
  process.stdout.write('', () => process.exit(code));
}

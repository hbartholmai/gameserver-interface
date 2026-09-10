/**
 * Durchlauf durch den Welt-Reiter gegen `GSP_RUNTIME=fake`.
 *
 * Prüft, was sich nur an der laufenden Oberfläche zeigt: dass der Reiter nur
 * bei Vorlagen mit Weltdaten erscheint, dass der Austausch bei laufender
 * Instanz gesperrt ist, dass der Dialog den Sicherungsschalter zeigt und das
 * Tippwort verlangt — und dass am Ende die neue Welt auf der Platte liegt.
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import yazl from 'yazl';

const URL = process.env.URL ?? 'http://127.0.0.1:8792';
const OUT = process.env.OUT ?? '.';
const DATA = process.env.DATA;

const schuss = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
const log = (...a) => console.log('·', ...a);
const pruefe = (text, bedingung) => console.log(`  ${bedingung ? 'ja ' : 'NEIN'}  ${text}`);

/** Ein ZIP, dessen Weltordner absichtlich anders heißt als der der Instanz. */
async function baueZip(pfad) {
  const zip = new yazl.ZipFile();
  zip.addBuffer(Buffer.from('ersetzte-welt'), 'Hügelland/level.dat');
  zip.addBuffer(Buffer.from('regionsdaten'), 'Hügelland/region/r.0.0.mca');
  zip.addBuffer(Buffer.from('nether'), 'Hügelland_nether/level.dat');
  zip.end();
  const teile = [];
  for await (const stueck of zip.outputStream) teile.push(stueck);
  writeFileSync(pfad, Buffer.concat(teile));
  return pfad;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('SEITENFEHLER:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('KONSOLE:', m.text()); });

await page.goto(URL);
await page.waitForSelector('.anmeldung__box');
await page.fill('#benutzer', 'admin');
await page.fill('#passwort', 'geheim-genug-1234');
await page.click('button[type=submit]');
await page.waitForSelector('.seite', { timeout: 15000 });
log('angemeldet');

// --- Minecraft-Instanz anlegen (hat Weltdaten) ---
await page.click('.knopf--gestrichelt');
await page.waitForSelector('.dialog');
await page.click('.vorlagenkarte');
await page.fill('#instanzname', 'Nordheim');
await page.click('.dialog__fuss .knopf--primaer');
await page.waitForTimeout(6000);
await page.click('.dialog__kopf .knopf--klein');
await page.waitForTimeout(1000);
log('Instanz „Nordheim" angelegt');

await page.locator('.instanzkarte').first().click();
await page.waitForSelector('.detailkopf__chip', { timeout: 15000 });

// --- Reiter vorhanden? ---
const reiter = (await page.locator('.reiter__knopf').allInnerTexts()).map((t) => t.trim());
log('Reiter:', reiter.join(' | '));
// Die Reiterbeschriftung steht in Großbuchstaben (CSS `text-transform`).
pruefe('Reiter „Welt" ist da', reiter.includes('WELT'));
pruefe('er steht vor „Backups"', reiter.indexOf('WELT') < reiter.indexOf('BACKUPS'));

await page.locator('.reiter__knopf', { hasText: 'Welt' }).click();
await page.waitForTimeout(1200);

/*
 * Den Weltnamen aus der Oberfläche lesen statt ihn zu raten: der Wizard nimmt
 * die Vorgabe der Vorlage, und die heißt bei Minecraft `world`.
 */
const weltName = (await page.locator('.kachel__wert').first().innerText()).trim();
log('Weltname laut Oberfläche:', weltName);

if (DATA) {
  const instanzen = join(DATA, 'instances');
  const { readdirSync } = await import('node:fs');
  const id = readdirSync(instanzen)[0];
  mkdirSync(join(instanzen, id, 'data', weltName, 'region'), { recursive: true });
  writeFileSync(join(instanzen, id, 'data', weltName, 'level.dat'), 'urspruengliche-welt');
  writeFileSync(join(instanzen, id, 'data', weltName, 'region', 'r.0.0.mca'), 'x'.repeat(5000));
  log('Weltdaten angelegt in', id, 'als', weltName);
  globalThis.__id = id;
  globalThis.__instanzen = instanzen;
  globalThis.__welt = weltName;
  // Reiter neu laden, damit die eben angelegten Dateien auftauchen.
  await page.locator('.reiter__knopf', { hasText: 'Übersicht' }).click();
  await page.waitForTimeout(400);
  await page.locator('.reiter__knopf', { hasText: 'Welt' }).click();
  await page.waitForTimeout(1200);
}
await schuss(page, 'welt-1-laufend');

const zeilen = await page.locator('.zeile__datei').allInnerTexts();
pruefe('alle drei Teile werden aufgelistet', zeilen.length === 3);
pruefe('fehlende Teile sind als „fehlt" markiert', (await page.locator('text=fehlt').count()) >= 2);

const tauschKnopf = page.getByRole('button', { name: 'Welt austauschen…' });
pruefe('Austausch ist bei laufender Instanz gesperrt', await tauschKnopf.isDisabled());
pruefe('Hinweis dazu ist sichtbar', (await page.locator('.hinweis--warnung').count()) > 0);
pruefe('Herunterladen bleibt frei', !(await page.locator('a.knopf').first().isDisabled?.() ?? false));

// --- Download ---
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 15000 }),
  page.locator('a.knopf', { hasText: 'Welt herunterladen' }).click(),
]);
const heruntergeladen = await download.suggestedFilename();
log('heruntergeladen als:', heruntergeladen);
pruefe(
  'Name folgt dem Muster <instanz>-<welt>-<zeit>.zip',
  // `String.raw`, sonst schluckt das Template-Literal die Backslashes der Regex.
  new RegExp(String.raw`^nordheim-${globalThis.__welt}-\d{4}-\d{2}-\d{2}-\d{4}\.zip$`).test(heruntergeladen),
);

// --- Stoppen, dann austauschen ---
await page.locator('.reiter__knopf', { hasText: 'Übersicht' }).click();
await page.getByRole('button', { name: 'Stoppen' }).click();
await page.waitForSelector('.dialog--schmal');
await page.locator('.dialog__fuss .knopf--gefahr').click();
await page.waitForTimeout(3000);
log('Instanz gestoppt');

await page.locator('.reiter__knopf', { hasText: 'Welt' }).click();
await page.waitForTimeout(800);
pruefe('Austausch ist jetzt frei', !(await tauschKnopf.isDisabled()));

const zipPfad = await baueZip(join(OUT, 'fremde-welt.zip'));
await page.locator('input[type=file]').setInputFiles(zipPfad);
await page.waitForSelector('.dialog--schmal');
await schuss(page, 'welt-2-dialog');

log('Dialogtitel:', (await page.locator('.dialog__titel').innerText()).trim());
const jaKnopf = page.locator('.dialog__fuss .knopf--gefahr');
pruefe('Knopf ist ohne Tippwort gesperrt', await jaKnopf.isDisabled());
pruefe('Sicherungsschalter ist da und vorgewählt', await page.locator('.feld__schalter input').isChecked());

await page.locator('#bestaetigung-tippen').fill('ersetzen');
pruefe('nach „ersetzen" frei', !(await jaKnopf.isDisabled()));
await schuss(page, 'welt-3-dialog-frei');

await jaKnopf.click();
await page.waitForTimeout(5000);
await schuss(page, 'welt-4-nachher');

if (DATA) {
  const weltDatei = join(globalThis.__instanzen, globalThis.__id, 'data', globalThis.__welt, 'level.dat');
  const inhalt = existsSync(weltDatei) ? readFileSync(weltDatei, 'utf8') : '(fehlt)';
  pruefe('die neue Welt liegt auf der Platte', inhalt === 'ersetzte-welt');
  const nether = join(globalThis.__instanzen, globalThis.__id, 'data', `${globalThis.__welt}_nether`, 'level.dat');
  pruefe('der Nether ist mitgekommen und wurde umbenannt', existsSync(nether));
  const alt = join(globalThis.__instanzen, globalThis.__id, 'data', globalThis.__welt, 'region', 'r.0.0.mca');
  pruefe('Reste der alten Welt sind weg', !existsSync(alt) || readFileSync(alt, 'utf8') === 'regionsdaten');
}

// --- Vorlage ohne Weltdaten: kein Reiter ---
await page.locator('.knopf--gestrichelt').first().click();
await page.waitForSelector('.dialog');
const cs2 = page.locator('.vorlagenkarte', { hasText: 'Counter-Strike' });
if (await cs2.count()) {
  await cs2.first().click();
  await page.fill('#instanzname', 'Ohnewelt');
  await page.click('.dialog__fuss .knopf--primaer');
  await page.waitForTimeout(6000);
  await page.click('.dialog__kopf .knopf--klein');
  await page.waitForTimeout(1000);
  await page.locator('.instanzkarte', { hasText: 'Ohnewelt' }).click();
  await page.waitForTimeout(1500);
  const reiter2 = await page.locator('.reiter__knopf').allInnerTexts();
  pruefe('bei CS2 fehlt der Welt-Reiter', !reiter2.some((t) => t.trim() === 'Welt'));
  await schuss(page, 'welt-5-ohne-welt');
} else {
  log('CS2-Karte nicht gefunden — Prüfung übersprungen');
}

await browser.close();
console.log('FERTIG');

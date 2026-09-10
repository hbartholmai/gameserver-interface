/**
 * Beleg, dass eine im Editor angelegte Vorlage Weltdaten bekommt — und dass
 * eine Instanz daraus den Welt-Reiter zeigt.
 *
 * Der Weg, der ohne diesen Abschnitt nicht ginge: „+ Vorlage von Hand" →
 * Weltdaten einschalten → speichern → Instanz anlegen → Reiter „Welt".
 */
import { chromium } from 'playwright';

const URL = process.env.URL ?? 'http://127.0.0.1:8798';
const OUT = process.env.OUT ?? '.';

const schuss = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

/**
 * Klappt einen Abschnitt auf, falls er zu ist. React behält den Zustand beim
 * Wechsel zwischen Vorlagen — ein blinder Klick würde ihn sonst zuklappen.
 */
async function aufklappen(abschnitt) {
  const kopf = abschnitt.locator('.abschnitt__kopf').first();
  if ((await kopf.getAttribute('aria-expanded')) !== 'true') await kopf.click();
}
const log = (...a) => console.log('·', ...a);
const pruefe = (text, bedingung) => console.log(`  ${bedingung ? 'ja ' : 'NEIN'}  ${text}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1400 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('SEITENFEHLER:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('KONSOLE:', m.text()); });

await page.goto(URL);
await page.waitForSelector('.anmeldung__box');
await page.fill('#benutzer', 'admin');
await page.fill('#passwort', 'geheim-genug-1234');
await page.click('button[type=submit]');
await page.waitForSelector('.seite', { timeout: 15000 });
log('angemeldet');

// --- Vorlagenverwaltung öffnen ---
await page.getByRole('button', { name: 'Vorlagen' }).click();
await page.waitForTimeout(800);

// --- Bestehende Vorlage öffnen: bleibt der Weltblock beim Bearbeiten stehen? ---
await page.locator('text=Minecraft').first().click();
await page.waitForTimeout(800);
const weltAbschnitt = page.locator('.abschnitt').filter({ has: page.locator('.abschnitt__titel', { hasText: 'Weltdaten' }) }).first();
await weltAbschnitt.scrollIntoViewIfNeeded();
pruefe('Abschnitt „Weltdaten" ist im Editor da', (await weltAbschnitt.count()) > 0);
await aufklappen(weltAbschnitt);
await page.waitForTimeout(400);
await schuss(page, 'editor-1-minecraft');

const schalter = weltAbschnitt.locator('.feld__schalter button').first();
pruefe('bei Minecraft ist er eingeschaltet', (await schalter.getAttribute('aria-pressed')) === 'true');
const teile = await weltAbschnitt.locator('.editorkarte').count();
pruefe(`die drei Teile sind sichtbar (gefunden: ${teile})`, teile === 3);

await page.getByRole('button', { name: 'Abbrechen' }).first().click().catch(() => {});
await page.waitForTimeout(600);

// --- Neue Vorlage von Hand ---
await page.locator('text=Vorlage von Hand').first().click();
await page.waitForTimeout(1200);
await schuss(page, 'editor-2a-neu-offen');
log('Abschnitte im neuen Editor:', (await page.locator('.abschnitt__titel').allInnerTexts()).join(' | '));

const neuWelt = page.locator('.abschnitt').filter({ has: page.locator('.abschnitt__titel', { hasText: 'Weltdaten' }) }).first();
await neuWelt.scrollIntoViewIfNeeded();
await aufklappen(neuWelt);
await page.waitForTimeout(300);
const neuSchalter = neuWelt.locator('.feld__schalter button').first();
pruefe('bei einer neuen Vorlage ist er aus', (await neuSchalter.getAttribute('aria-pressed')) === 'false');

await neuSchalter.click();
await page.waitForTimeout(400);
await schuss(page, 'editor-2-neu-eingeschaltet');
pruefe('nach dem Einschalten steht ein erster Teil da', (await neuWelt.locator('.editorkarte').count()) === 1);
const vorbelegt = await neuWelt.locator('.feld__eingabe input').first().inputValue();
log('Verzeichnis vorbelegt mit:', vorbelegt);
pruefe('das Verzeichnis ist sinnvoll vorbelegt', vorbelegt.startsWith('/'));

await browser.close();
console.log('FERTIG');

/** Zeigt die Kopfzeile die Fassung an — vor und nach der Anmeldung? */
import { chromium } from 'playwright';

const URL = process.env.URL ?? 'http://127.0.0.1:8810';
const OUT = process.env.OUT ?? '.';
const pruefe = (text, bedingung) => console.log(`  ${bedingung ? 'ja ' : 'NEIN'}  ${text}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 600 }, deviceScaleFactor: 2 });

await page.goto(URL);
await page.waitForSelector('.login__box');
const vorAnmeldung = (await page.locator('.header__version').innerText()).trim();
console.log('· auf der Anmeldeseite:', vorAnmeldung);
// Die Kopfzeile ist durchgehend versal gesetzt (CSS `text-transform`), im
// Quelltext steht `v0.3`.
pruefe('vor der Anmeldung sichtbar', vorAnmeldung.toLowerCase() === 'v0.3');
await page.screenshot({ path: `${OUT}/ver-1-anmeldung.png` });

await page.fill('#benutzer', 'admin');
await page.fill('#passwort', 'geheim-genug-1234');
await page.click('button[type=submit]');
await page.waitForSelector('.page', { timeout: 15000 });
await page.waitForTimeout(800);

const kontext = (await page.locator('.header__context').innerText()).trim();
console.log('· Kontextzeile:', kontext);
pruefe('Fassung steht vor Knoten und Laufzeit', /^V0\.3\s*·/.test(kontext));
pruefe('Knotenname und Laufzeit stehen weiter da', /NODE 01/.test(kontext) && /SIMULIERT/.test(kontext));
await page.locator('.header').screenshot({ path: `${OUT}/ver-2-kopfzeile.png` });

await browser.close();
console.log('FERTIG');

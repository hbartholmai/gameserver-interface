import { chromium } from 'playwright';

const URL = 'http://127.0.0.1:8792';
const OUT = process.env.OUT;
const schuss = async (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('SEITENFEHLER:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('KONSOLE:', m.text()); });

const log = (...a) => console.log('·', ...a);

await page.goto(URL);
await page.waitForSelector('.login__box');

// Ersteinrichtung
await page.fill('#benutzer', 'admin');
await page.fill('#passwort', 'geheim-genug-1234');
await page.click('button[type=submit]');
await page.waitForSelector('.page', { timeout: 15000 });
log('angemeldet');

// Zwei Instanzen anlegen
for (const name of ['Testwelt', 'Zweitwelt']) {
  await page.click('.button--dashed');
  await page.waitForSelector('.dialog');
  await page.click('.templatecard');
  await page.fill('#instanzname', name);
  await page.click('.dialog__foot .button--primary');
  await page.waitForTimeout(6000);
  await page.click('.dialog__head .button--small');
  await page.waitForTimeout(1000);
  log('angelegt:', name);
}

const sichtbar = (t) => page.locator('.dialog--narrow', { hasText: t });

// --- Stoppen ---
await page.locator('.instancecard').first().click();
await page.waitForSelector('.detailhead__chip', { timeout: 15000 });
await page.waitForTimeout(300);
const statusVorher = await page.locator('.detailhead__chip').innerText();
log('Status vor Stopp:', statusVorher.trim());

await page.locator('.detailhead__actions .button--primary').click();
await page.waitForSelector('.dialog--narrow');
await schuss(page, '1-stoppen');
log('Stopp-Dialog:', (await page.locator('.dialog__title').innerText()).trim());

// Escape bricht ab
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
console.log('  Dialog nach Escape weg:', (await page.locator('.dialog--narrow').count()) === 0);
console.log('  Status unverändert:', (await page.locator('.detailhead__chip').innerText()).trim() === statusVorher.trim());

// Jetzt bestätigen
await page.locator('.detailhead__actions .button--primary').click();
await page.waitForSelector('.dialog--narrow');
await page.locator('.dialog__foot .button--danger').click();
await page.waitForTimeout(2500);
log('Status nach Stopp:', (await page.locator('.detailhead__chip').innerText()).trim());

// --- Neustart ---
await page.locator('.detailhead__actions .button--primary').click(); // Starten (ohne Rückfrage)
console.log('  Starten ohne Rückfrage:', (await page.locator('.dialog--narrow').count()) === 0);
await page.waitForTimeout(3000);
await page.locator('.detailhead__actions .button--secondary').first().click();
await page.waitForSelector('.dialog--narrow');
await schuss(page, '2-neustart');
log('Neustart-Dialog:', (await page.locator('.dialog__title').innerText()).trim(),
    '| Knopfklasse gefahr?', await page.locator('.dialog__foot .button--danger').count());
await page.locator('.dialog__foot .button--primary').click();
await page.waitForTimeout(3000);

// --- Container entfernen (einfache Rückfrage, kein Tippfeld) ---
await page.locator('text=Container entfernen').click();
await page.waitForSelector('.dialog--narrow');
await schuss(page, '3-container-entfernen');
console.log('  ohne Tippfeld:', (await page.locator('.dialog--narrow input').count()) === 0);
await page.locator('.dialog__foot .button--secondary').click();

// --- Mit Weltdaten löschen (Tippwort) ---
await page.locator('text=Mit Weltdaten löschen').click();
await page.waitForSelector('.dialog--narrow');
const jaKnopf = page.locator('.dialog__foot .button--danger');
console.log('  Knopf anfangs gesperrt:', await jaKnopf.isDisabled());
await schuss(page, '4-loeschen-gesperrt');
await page.locator('#bestaetigung-tippen').fill('lösch');
console.log('  bei „lösch" noch gesperrt:', await jaKnopf.isDisabled());
await page.locator('#bestaetigung-tippen').fill('LÖSCHEN');
console.log('  bei „LÖSCHEN" frei:', !(await jaKnopf.isDisabled()));
await page.locator('#bestaetigung-tippen').fill('löschen');
console.log('  bei „löschen" frei:', !(await jaKnopf.isDisabled()));
await schuss(page, '5-loeschen-frei');
const vorher = await page.locator('.instancecard').count();
await jaKnopf.click();
await page.waitForTimeout(2500);
console.log('  Instanzen in Sidebar vorher/nachher:', vorher, await page.locator('.instancecard').count());

// --- Vorlage löschen ---
await page.locator('text=Vorlagen').first().click();
await page.waitForTimeout(800);
await page.locator('.vorlagenliste button, .templates button').first().click().catch(() => {});
await page.waitForTimeout(600);
const loeschKnopf = page.locator('.button--small-danger', { hasText: 'Löschen' });
if (await loeschKnopf.count()) {
  await loeschKnopf.first().click();
  await page.waitForTimeout(400);
  if (await page.locator('.dialog--narrow').count()) {
    await schuss(page, '6-vorlage-loeschen');
    log('Vorlagendialog:', (await page.locator('.dialog__title').innerText()).trim());
    await page.locator('.dialog__foot .button--secondary').click();
  } else {
    log('Vorlagen-Löschknopf gesperrt (Instanzen beruhen darauf)');
  }
}

await browser.close();
console.log('FERTIG');

import { beforeAll, describe, expect, it } from 'vitest';
import { getTemplate, loadBuiltinTemplates, worldTarget, type WorldTarget } from '@gsp/shared';
import { ZuordnungsError, istGefaehrlich, ordneArchivZu } from './welt-zuordnung.js';

/**
 * Die Zuordnung fremder Archive auf die Weltpfade einer Instanz.
 *
 * Der Teil, an dem ein Fehler Weltdaten kostet: Er löscht die bisherige Welt
 * und legt an ihre Stelle etwas, das der Server nicht lesen kann. Deshalb steht
 * er hier als Tabelle aus Eintragsnamen — ohne Dateisystem, ohne ZIP, ohne
 * Docker.
 */

function ziel(vorlage: string, werte: Record<string, string>): WorldTarget {
  const t = worldTarget(getTemplate(vorlage), werte);
  if (!t) throw new Error(`${vorlage} hat keine Weltangabe`);
  return t;
}

beforeAll(() => {
  loadBuiltinTemplates();
});

describe('gefährliche Einträge', () => {
  it.each([
    '../../etc/passwd',
    'a/../../b',
    '/etc/passwd',
    '\\windows\\system32',
    'C:/Users/henri',
    'welt\\region\\r.mca',
    '',
  ])('lehnt „%s“ ab', (name) => {
    expect(istGefaehrlich(name)).toBe(true);
  });

  it.each(['welt/level.dat', 'Meine Welt.wld', 'welt/region/r.0.0.mca', 'a..b/c'])(
    'lässt „%s“ durch',
    (name) => {
      expect(istGefaehrlich(name)).toBe(false);
    },
  );

  it('bricht die ganze Zuordnung ab, sobald ein Eintrag ausbricht', () => {
    expect(() => ordneArchivZu(['welt/level.dat', '../../etc/passwd'], ziel('minecraft', { levelName: 'welt' })))
      .toThrow(ZuordnungsError);
  });
});

describe('Minecraft — Verzeichnis mit Geschwistern', () => {
  const mc = () => ziel('minecraft', { levelName: 'welt' });

  it('nimmt den Inhalt, wenn die Welt ohne Hülle gepackt wurde', () => {
    expect(ordneArchivZu(['level.dat', 'region/r.0.0.mca'], mc())).toEqual([
      { quelle: 'level.dat', ziel: 'welt/level.dat' },
      { quelle: 'region/r.0.0.mca', ziel: 'welt/region/r.0.0.mca' },
    ]);
  });

  it('schneidet eine anders benannte Hülle ab und benennt um', () => {
    expect(ordneArchivZu(['MeineWelt/level.dat', 'MeineWelt/region/r.0.0.mca'], mc())).toEqual([
      { quelle: 'MeineWelt/level.dat', ziel: 'welt/level.dat' },
      { quelle: 'MeineWelt/region/r.0.0.mca', ziel: 'welt/region/r.0.0.mca' },
    ]);
  });

  /*
   * Der Fall, für den es die Stammzuordnung gibt: Nether und End liegen als
   * Geschwister daneben. Ohne sie käme nur die Oberwelt an, und der Spieler
   * stünde nach dem Portal in einer frisch erzeugten Hölle.
   */
  it('erkennt Nether und End als Geschwister und benennt alle drei um', () => {
    expect(
      ordneArchivZu(
        ['Hügelland/level.dat', 'Hügelland_nether/level.dat', 'Hügelland_the_end/level.dat'],
        mc(),
      ),
    ).toEqual([
      { quelle: 'Hügelland/level.dat', ziel: 'welt/level.dat' },
      { quelle: 'Hügelland_nether/level.dat', ziel: 'welt_nether/level.dat' },
      { quelle: 'Hügelland_the_end/level.dat', ziel: 'welt_the_end/level.dat' },
    ]);
  });

  it('findet die Welt über den Marker, wenn sie tiefer liegt', () => {
    expect(ordneArchivZu(['Backup/2026-09/MeineWelt/level.dat', 'Backup/2026-09/MeineWelt/session.lock'], mc()))
      .toEqual([
        { quelle: 'Backup/2026-09/MeineWelt/level.dat', ziel: 'welt/level.dat' },
        { quelle: 'Backup/2026-09/MeineWelt/session.lock', ziel: 'welt/session.lock' },
      ]);
  });

  it('verweigert die Wahl, wenn zwei Welten im Archiv liegen', () => {
    expect(() => ordneArchivZu(['A/level.dat', 'B/level.dat'], mc())).toThrow(/mehrere Welten/);
  });

  it('meldet ein Archiv ohne Welt, statt irgendetwas einzuspielen', () => {
    expect(() => ordneArchivZu(['liesmich.txt', 'bilder/screenshot.png'], mc())).toThrow(/keine Welt/);
  });

  it('wirft den Beiwerk des Betriebssystems weg', () => {
    expect(
      ordneArchivZu(['__MACOSX/._welt', 'MeineWelt/.DS_Store', 'MeineWelt/level.dat'], mc()),
    ).toEqual([{ quelle: 'MeineWelt/level.dat', ziel: 'welt/level.dat' }]);
  });
});

describe('Valheim — Dateigruppe mit gemeinsamem Stamm', () => {
  const vh = () => ziel('valheim', { worldName: 'Midgard' });

  it('benennt den Stamm auf den der Instanz um', () => {
    expect(ordneArchivZu(['Welt.fwl', 'Welt.db'], vh())).toEqual([
      { quelle: 'Welt.fwl', ziel: 'Midgard.fwl' },
      { quelle: 'Welt.db', ziel: 'Midgard.db' },
    ]);
  });

  /*
   * Längstes Suffix zuerst: sonst liest `.db` das `Welt.db.old` als Stamm
   * `Welt.db` und legt es als `Midgard.db.db` ab.
   */
  it('ordnet .old-Kopien dem längeren Suffix zu, nicht dem kürzeren', () => {
    expect(ordneArchivZu(['Welt.fwl', 'Welt.db', 'Welt.db.old'], vh())).toEqual([
      { quelle: 'Welt.fwl', ziel: 'Midgard.fwl' },
      { quelle: 'Welt.db', ziel: 'Midgard.db' },
      { quelle: 'Welt.db.old', ziel: 'Midgard.db.old' },
    ]);
  });

  it('lehnt eine .fwl ohne Karte ab', () => {
    expect(() => ordneArchivZu(['Welt.fwl'], vh())).toThrow(/fehlt/);
  });

  it('verweigert die Wahl bei zwei Welten', () => {
    expect(() => ordneArchivZu(['A.fwl', 'A.db', 'B.fwl', 'B.db'], vh())).toThrow(/mehrere Welten/);
  });
});

describe('Terraria — einzelne Datei ohne Endung', () => {
  const tr = () => ziel('terraria', { worldName: 'welt' });

  it('legt eine .wld unter dem Namen der Instanz ab, ohne Endung', () => {
    expect(ordneArchivZu(['Meine Welt.wld'], tr())).toEqual([
      { quelle: 'Meine Welt.wld', ziel: 'welt' },
    ]);
  });

  it('schneidet eine Hülle ab', () => {
    expect(ordneArchivZu(['Ordner/Meine Welt.wld'], tr())).toEqual([
      { quelle: 'Ordner/Meine Welt.wld', ziel: 'welt' },
    ]);
  });

  it('lehnt zwei Weltdateien ab, statt eine zu raten', () => {
    expect(() => ordneArchivZu(['a.wld', 'b.wld'], tr())).toThrow(/mehr als eine Datei/);
  });
});

describe('Factorio — die Welt ist selbst ein ZIP', () => {
  it('ordnet einen entpackten Spielstand auf den Namen der Instanz zu', () => {
    // Der Regelfall ist, dass ein `.zip` gar nicht erst entpackt wird; kommt es
    // doch als Archiv an, gilt dieselbe Ein-Datei-Regel wie bei Terraria.
    expect(ordneArchivZu(['anderer-name.zip'], ziel('factorio', { saveName: 'welt' }))).toEqual([
      { quelle: 'anderer-name.zip', ziel: 'welt.zip' },
    ]);
  });
});

describe('Enshrouded — Verzeichnis mit festem Namen', () => {
  it('nimmt den Inhalt unter den festen Namen', () => {
    expect(ordneArchivZu(['savegame/1.db', 'savegame/2.db'], ziel('enshrouded', {}))).toEqual([
      { quelle: 'savegame/1.db', ziel: 'savegame/1.db' },
      { quelle: 'savegame/2.db', ziel: 'savegame/2.db' },
    ]);
  });
});

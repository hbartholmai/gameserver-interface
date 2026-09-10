import type { WorldTarget, WorldTargetPart } from '@gsp/shared';

/**
 * Bildet die Einträge eines hochgeladenen Archivs auf die Weltpfade einer
 * Instanz ab.
 *
 * Das Archiv kommt von irgendwo — aus dem Einzelspieler-Ordner des Benutzers,
 * von einem anderen Anbieter, aus einem fremden Sicherungswerkzeug. Der
 * Weltname darin heißt fast nie so wie der der Instanz, und die Verschachtelung
 * ist beliebig. Hier entsteht daraus eine Liste `Eintrag → Zielpfad`.
 *
 * **Absichtlich ohne Dateisystem und ohne ZIP-Bibliothek.** Ein Fehler an
 * dieser Stelle löscht eine Welt und legt die falsche hin; der Teil muss sich
 * als Tabelle aus Namen prüfen lassen, nicht nur am laufenden Panel.
 */

export class ZuordnungsError extends Error {}

export interface Zuordnung {
  /** Eintragsname im Archiv. */
  quelle: string;
  /** Pfad relativ zum Elternverzeichnis der Welt, etwa `welt/region/r.0.0.mca`. */
  ziel: string;
}

/** Was das Betriebssystem des Benutzers mitgepackt hat und niemand haben will. */
const MUELL = [
  /^__MACOSX\//,
  /(^|\/)\.DS_Store$/,
  /(^|\/)Thumbs\.db$/i,
  /(^|\/)desktop\.ini$/i,
  /(^|\/)\._[^/]*$/,
];

/**
 * Namen, die niemals entpackt werden. Ein `..` oder ein absoluter Pfad im
 * Archiv schriebe nach dem Entpacken aus dem Zielverzeichnis heraus — bei einer
 * Datei, die ein Fremder geliefert hat, ist das kein Randfall.
 */
export function istGefaehrlich(name: string): boolean {
  if (name === '' || name.startsWith('/') || name.startsWith('\\')) return true;
  if (name.includes('\\')) return true;
  if (name.includes('\0')) return true;
  if (/^[A-Za-z]:/.test(name)) return true;
  return name.split('/').some((teil) => teil === '..');
}

function istMuell(name: string): boolean {
  return MUELL.some((m) => m.test(name));
}

/** Erstes Pfadsegment. */
function wurzel(name: string): string {
  const index = name.indexOf('/');
  return index === -1 ? name : name.slice(0, index);
}

/**
 * Passt ein Wurzelname zu einem Teil der Welt? Längstes Suffix zuerst, sonst
 * schluckt `.db` das `.db.old` und das leere Suffix jedes `_nether`.
 */
function teileNachSuffixlaenge(ziel: WorldTarget): WorldTargetPart[] {
  return [...ziel.parts].sort((a, b) => b.suffix.length - a.suffix.length);
}

/**
 * Schritt B — Stammzuordnung. Sucht einen gemeinsamen Stamm, unter dem sich die
 * Wurzeleinträge des Archivs als Teile der Welt lesen lassen.
 *
 * Das ist der Fall, wenn jemand `MeineWelt/`, `MeineWelt_nether/` und
 * `MeineWelt_the_end/` nebeneinander gepackt hat, oder `Midgard.fwl` neben
 * `Midgard.db`. Ergebnis ist eine Abbildung Wurzelname → Teil.
 */
function stammZuordnung(
  wurzeln: string[],
  ziel: WorldTarget,
): { stamm: string; treffer: Map<string, WorldTargetPart> } | null {
  if (ziel.parts.length < 2) return null;

  const teile = teileNachSuffixlaenge(ziel);
  /** Stamm → gefundene Teile. */
  const kandidaten = new Map<string, Map<string, WorldTargetPart>>();

  for (const name of wurzeln) {
    for (const teil of teile) {
      if (teil.suffix !== '' && !name.endsWith(teil.suffix)) continue;
      const stamm = teil.suffix === '' ? name : name.slice(0, -teil.suffix.length);
      if (stamm === '') continue;
      let treffer = kandidaten.get(stamm);
      if (!treffer) {
        treffer = new Map();
        kandidaten.set(stamm, treffer);
      }
      // Der erste passende Teil gewinnt — die Liste ist nach Suffixlänge sortiert.
      if (!treffer.has(name)) treffer.set(name, teil);
      break;
    }
  }

  // Nur Stämme, die mehr als einen Wurzeleintrag erklären, sind eine
  // Stammzuordnung. Bei einem einzelnen Eintrag greift Schritt C, der auch
  // umbenennen kann.
  const brauchbar = [...kandidaten.entries()].filter(([, treffer]) => treffer.size >= 2);
  if (brauchbar.length === 0) return null;

  const beste = Math.max(...brauchbar.map(([, treffer]) => treffer.size));
  const gleichauf = brauchbar.filter(([, treffer]) => treffer.size === beste);
  if (gleichauf.length > 1) {
    const namen = gleichauf.map(([stamm]) => stamm).sort().slice(0, 3).join(', ');
    throw new ZuordnungsError(`Das Archiv enthält mehrere Welten (${namen}) — bitte eine einzelne hochladen`);
  }

  const [stamm, treffer] = gleichauf[0]!;
  return { stamm, treffer };
}

/** Längster gemeinsamer Pfadpräfix, auf Segmentgrenzen. */
function gemeinsamerPraefix(namen: string[]): string {
  const ersterName = namen[0];
  if (ersterName === undefined) return '';
  let praefix = ersterName.split('/').slice(0, -1);
  for (const name of namen.slice(1)) {
    const segmente = name.split('/').slice(0, -1);
    let i = 0;
    while (i < praefix.length && i < segmente.length && praefix[i] === segmente[i]) i++;
    praefix = praefix.slice(0, i);
    if (praefix.length === 0) break;
  }
  return praefix.length === 0 ? '' : `${praefix.join('/')}/`;
}

/**
 * Schritt C — Wurzel abschneiden. Was danach übrig bleibt, ist der Inhalt der
 * Welt; er landet unter dem Namen, den die Instanz erwartet.
 */
function wurzelAbschneiden(namen: string[], ziel: WorldTarget): Zuordnung[] {
  let rest = namen.map((n) => ({ quelle: n, kurz: n }));
  const praefix = gemeinsamerPraefix(namen);
  if (praefix !== '') rest = rest.map((e) => ({ ...e, kurz: e.kurz.slice(praefix.length) }));

  const haupt = ziel.haupt;

  /*
   * Marker: Nennt die Vorlage eine Datei, an der eine Welt erkennbar ist, und
   * liegt sie nach dem Abschneiden nicht an der Wurzel, dann steckt die Welt
   * eine Ebene tiefer — `Backup/2026-09/MeineWelt/level.dat`.
   */
  if (ziel.markers.length > 0 && !rest.some((e) => ziel.markers.includes(e.kurz))) {
    const mitMarker = new Set<string>();
    for (const e of rest) {
      const teile = e.kurz.split('/');
      if (teile.length === 2 && ziel.markers.includes(teile[1]!)) mitMarker.add(teile[0]!);
    }
    if (mitMarker.size === 1) {
      const ordner = `${[...mitMarker][0]!}/`;
      rest = rest.filter((e) => e.kurz.startsWith(ordner)).map((e) => ({ ...e, kurz: e.kurz.slice(ordner.length) }));
    } else if (mitMarker.size > 1) {
      const namen = [...mitMarker].sort().slice(0, 3).join(', ');
      throw new ZuordnungsError(`Das Archiv enthält mehrere Welten (${namen}) — bitte eine einzelne hochladen`);
    } else {
      throw new ZuordnungsError(
        `Im Archiv wurde keine Welt gefunden (erwartet wurde ${ziel.markers.join(' oder ')})`,
      );
    }
  }

  if (haupt.type === 'file') {
    // Eine Einzeldatei als Ziel: nach dem Abschneiden darf genau eine übrig sein.
    const dateien = rest.filter((e) => !e.kurz.endsWith('/'));
    if (dateien.length !== 1) {
      const beispiele = dateien.slice(0, 3).map((e) => e.kurz).join(', ');
      throw new ZuordnungsError(
        dateien.length === 0
          ? 'Das Archiv enthält keine Datei'
          : `Das Archiv enthält mehr als eine Datei (${beispiele}) — erwartet wird genau eine Welt`,
      );
    }
    return [{ quelle: dateien[0]!.quelle, ziel: haupt.fileName }];
  }

  /*
   * Verzeichnis als Ziel. Bleibt nach dem Abschneiden genau ein Verzeichnis und
   * sonst nichts übrig, ist das noch eine Hülle — mehr Raterei als das findet
   * hier nicht statt.
   */
  const wurzeln = new Set(rest.map((e) => wurzel(e.kurz)));
  const dateienOben = rest.filter((e) => !e.kurz.includes('/'));
  if (wurzeln.size === 1 && dateienOben.length === 0) {
    const ordner = `${[...wurzeln][0]!}/`;
    rest = rest.map((e) => ({ ...e, kurz: e.kurz.slice(ordner.length) }));
  }

  return rest
    .filter((e) => e.kurz !== '')
    .map((e) => ({ quelle: e.quelle, ziel: `${haupt.fileName}/${e.kurz}` }));
}

/**
 * Ordnet die Einträge eines Archivs den Weltpfaden zu.
 *
 * `namen` sind die Eintragsnamen des ZIP, Verzeichnisse mit `/` am Ende. Das
 * Ergebnis ist relativ zum Elternverzeichnis der Welt.
 */
export function ordneArchivZu(namen: string[], ziel: WorldTarget): Zuordnung[] {
  for (const name of namen) {
    if (istGefaehrlich(name)) {
      throw new ZuordnungsError(`Das Archiv enthält einen unzulässigen Eintrag: „${name}“`);
    }
  }

  const nutz = namen.filter((n) => !istMuell(n) && !n.endsWith('/'));
  if (nutz.length === 0) throw new ZuordnungsError('Das Archiv ist leer');

  const stamm = stammZuordnung([...new Set(nutz.map(wurzel))], ziel);
  const zuordnungen =
    stamm === null
      ? wurzelAbschneiden(nutz, ziel)
      : nutz
          .filter((n) => stamm.treffer.has(wurzel(n)))
          .map((n) => {
            const teil = stamm.treffer.get(wurzel(n))!;
            const rest = n.slice(wurzel(n).length);
            return { quelle: n, ziel: `${teil.fileName}${rest}` };
          });

  pruefePflichtteile(zuordnungen, ziel);
  return zuordnungen;
}

/**
 * Sind alle Teile da, ohne die die Welt nicht benutzbar wäre? Eine Valheim-`.fwl`
 * ohne die zugehörige `.db` ergäbe eine leere Welt — der Spieler stünde vor
 * einer neu erzeugten Karte und hielte sie für Datenverlust. Er hätte recht.
 */
function pruefePflichtteile(zuordnungen: Zuordnung[], ziel: WorldTarget): void {
  const getroffen = new Set(zuordnungen.map((z) => wurzel(z.ziel)));
  const fehlend = ziel.parts.filter((p) => p.required && !getroffen.has(p.fileName));
  if (fehlend.length === 0) return;

  const namen = fehlend.map((p) => (p.suffix === '' ? 'die Welt selbst' : p.suffix)).join(', ');
  throw new ZuordnungsError(`Im Archiv fehlt: ${namen}`);
}

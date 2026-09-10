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

export class MappingError extends Error {}

export interface Mapping {
  /** Eintragsname im Archiv. */
  source: string;
  /** Pfad relativ zum Elternverzeichnis der Welt, etwa `welt/region/r.0.0.mca`. */
  target: string;
}

/** Was das Betriebssystem des Benutzers mitgepackt hat und niemand haben will. */
const JUNK = [
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
export function isDangerous(name: string): boolean {
  if (name === '' || name.startsWith('/') || name.startsWith('\\')) return true;
  if (name.includes('\\')) return true;
  if (name.includes('\0')) return true;
  if (/^[A-Za-z]:/.test(name)) return true;
  return name.split('/').some((part) => part === '..');
}

function isJunk(name: string): boolean {
  return JUNK.some((m) => m.test(name));
}

/** Erstes Pfadsegment. */
function rootSegment(name: string): string {
  const index = name.indexOf('/');
  return index === -1 ? name : name.slice(0, index);
}

/**
 * Passt ein Wurzelname zu einem Teil der Welt? Längstes Suffix zuerst, sonst
 * schluckt `.db` das `.db.old` und das leere Suffix jedes `_nether`.
 */
function partsBySuffixLength(target: WorldTarget): WorldTargetPart[] {
  return [...target.parts].sort((a, b) => b.suffix.length - a.suffix.length);
}

/**
 * Schritt B — Stammzuordnung. Sucht einen gemeinsamen Stamm, unter dem sich die
 * Wurzeleinträge des Archivs als Teile der Welt lesen lassen.
 *
 * Das ist der Fall, wenn jemand `MeineWelt/`, `MeineWelt_nether/` und
 * `MeineWelt_the_end/` nebeneinander gepackt hat, oder `Midgard.fwl` neben
 * `Midgard.db`. Ergebnis ist eine Abbildung Wurzelname → Teil.
 */
function matchSiblings(
  roots: string[],
  target: WorldTarget,
): { base: string; matches: Map<string, WorldTargetPart> } | null {
  if (target.parts.length < 2) return null;

  const parts = partsBySuffixLength(target);
  /** Stamm → gefundene Teile. */
  const candidates = new Map<string, Map<string, WorldTargetPart>>();

  for (const name of roots) {
    for (const part of parts) {
      if (part.suffix !== '' && !name.endsWith(part.suffix)) continue;
      const base = part.suffix === '' ? name : name.slice(0, -part.suffix.length);
      if (base === '') continue;
      let matches = candidates.get(base);
      if (!matches) {
        matches = new Map();
        candidates.set(base, matches);
      }
      // Der erste passende Teil gewinnt — die Liste ist nach Suffixlänge sortiert.
      if (!matches.has(name)) matches.set(name, part);
      break;
    }
  }

  // Nur Stämme, die mehr als einen Wurzeleintrag erklären, sind eine
  // Stammzuordnung. Bei einem einzelnen Eintrag greift Schritt C, der auch
  // umbenennen kann.
  const usable = [...candidates.entries()].filter(([, matches]) => matches.size >= 2);
  if (usable.length === 0) return null;

  const best = Math.max(...usable.map(([, matches]) => matches.size));
  const tied = usable.filter(([, matches]) => matches.size === best);
  if (tied.length > 1) {
    const names = tied.map(([base]) => base).sort().slice(0, 3).join(', ');
    throw new MappingError(`Das Archiv enthält mehrere Welten (${names}) — bitte eine einzelne hochladen`);
  }

  const [base, matches] = tied[0]!;
  return { base, matches };
}

/** Längster gemeinsamer Pfadpräfix, auf Segmentgrenzen. */
function commonPrefix(names: string[]): string {
  const firstName = names[0];
  if (firstName === undefined) return '';
  let prefix = firstName.split('/').slice(0, -1);
  for (const name of names.slice(1)) {
    const segments = name.split('/').slice(0, -1);
    let i = 0;
    while (i < prefix.length && i < segments.length && prefix[i] === segments[i]) i++;
    prefix = prefix.slice(0, i);
    if (prefix.length === 0) break;
  }
  return prefix.length === 0 ? '' : `${prefix.join('/')}/`;
}

/**
 * Schritt C — Wurzel abschneiden. Was danach übrig bleibt, ist der Inhalt der
 * Welt; er landet unter dem Namen, den die Instanz erwartet.
 */
function stripWrapper(names: string[], target: WorldTarget): Mapping[] {
  let rest = names.map((n) => ({ source: n, short: n }));
  const prefix = commonPrefix(names);
  if (prefix !== '') rest = rest.map((e) => ({ ...e, short: e.short.slice(prefix.length) }));

  const main = target.main;

  /*
   * Marker: Nennt die Vorlage eine Datei, an der eine Welt erkennbar ist, und
   * liegt sie nach dem Abschneiden nicht an der Wurzel, dann steckt die Welt
   * eine Ebene tiefer — `Backup/2026-09/MeineWelt/level.dat`.
   */
  if (target.markers.length > 0 && !rest.some((e) => target.markers.includes(e.short))) {
    const withMarker = new Set<string>();
    for (const e of rest) {
      const parts = e.short.split('/');
      if (parts.length === 2 && target.markers.includes(parts[1]!)) withMarker.add(parts[0]!);
    }
    if (withMarker.size === 1) {
      const folder = `${[...withMarker][0]!}/`;
      rest = rest.filter((e) => e.short.startsWith(folder)).map((e) => ({ ...e, short: e.short.slice(folder.length) }));
    } else if (withMarker.size > 1) {
      const names = [...withMarker].sort().slice(0, 3).join(', ');
      throw new MappingError(`Das Archiv enthält mehrere Welten (${names}) — bitte eine einzelne hochladen`);
    } else {
      throw new MappingError(
        `Im Archiv wurde keine Welt gefunden (erwartet wurde ${target.markers.join(' oder ')})`,
      );
    }
  }

  if (main.type === 'file') {
    // Eine Einzeldatei als Ziel: nach dem Abschneiden darf genau eine übrig sein.
    const files = rest.filter((e) => !e.short.endsWith('/'));
    if (files.length !== 1) {
      const samples = files.slice(0, 3).map((e) => e.short).join(', ');
      throw new MappingError(
        files.length === 0
          ? 'Das Archiv enthält keine Datei'
          : `Das Archiv enthält mehr als eine Datei (${samples}) — erwartet wird genau eine Welt`,
      );
    }
    return [{ source: files[0]!.source, target: main.fileName }];
  }

  /*
   * Verzeichnis als Ziel. Bleibt nach dem Abschneiden genau ein Verzeichnis und
   * sonst nichts übrig, ist das noch eine Hülle — mehr Raterei als das findet
   * hier nicht statt.
   */
  const roots = new Set(rest.map((e) => rootSegment(e.short)));
  const filesAtRoot = rest.filter((e) => !e.short.includes('/'));
  if (roots.size === 1 && filesAtRoot.length === 0) {
    const folder = `${[...roots][0]!}/`;
    rest = rest.map((e) => ({ ...e, short: e.short.slice(folder.length) }));
  }

  return rest
    .filter((e) => e.short !== '')
    .map((e) => ({ source: e.source, target: `${main.fileName}/${e.short}` }));
}

/**
 * Ordnet die Einträge eines Archivs den Weltpfaden zu.
 *
 * `namen` sind die Eintragsnamen des ZIP, Verzeichnisse mit `/` am Ende. Das
 * Ergebnis ist relativ zum Elternverzeichnis der Welt.
 */
export function mapArchive(names: string[], target: WorldTarget): Mapping[] {
  for (const name of names) {
    if (isDangerous(name)) {
      throw new MappingError(`Das Archiv enthält einen unzulässigen Eintrag: „${name}“`);
    }
  }

  const useful = names.filter((n) => !isJunk(n) && !n.endsWith('/'));
  if (useful.length === 0) throw new MappingError('Das Archiv ist leer');

  const base = matchSiblings([...new Set(useful.map(rootSegment))], target);
  const zuordnungen =
    base === null
      ? stripWrapper(useful, target)
      : useful
          .filter((n) => base.matches.has(rootSegment(n)))
          .map((n) => {
            const part = base.matches.get(rootSegment(n))!;
            const rest = n.slice(rootSegment(n).length);
            return { source: n, target: `${part.fileName}${rest}` };
          });

  checkRequiredParts(zuordnungen, target);
  return zuordnungen;
}

/**
 * Sind alle Teile da, ohne die die Welt nicht benutzbar wäre? Eine Valheim-`.fwl`
 * ohne die zugehörige `.db` ergäbe eine leere Welt — der Spieler stünde vor
 * einer neu erzeugten Karte und hielte sie für Datenverlust. Er hätte recht.
 */
function checkRequiredParts(zuordnungen: Mapping[], target: WorldTarget): void {
  const covered = new Set(zuordnungen.map((z) => rootSegment(z.target)));
  const missing = target.parts.filter((p) => p.required && !covered.has(p.fileName));
  if (missing.length === 0) return;

  const names = missing.map((p) => (p.suffix === '' ? 'die Welt selbst' : p.suffix)).join(', ');
  throw new MappingError(`Im Archiv fehlt: ${names}`);
}

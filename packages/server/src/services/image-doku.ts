/**
 * Holt die Dokumentation eines Docker-Images direkt bei der Quelle.
 *
 * Ursprünglich sollte ein Sprachmodell mit Websuche recherchieren. Das ging
 * nicht: Googles Suchwerkzeug ist im kostenlosen Kontingent nicht enthalten und
 * antwortet dort mit `RESOURCE_EXHAUSTED` — schon beim ersten Aufruf.
 *
 * Der direkte Weg ist ohnehin der bessere. Die Beschreibung auf Docker Hub ist
 * die **Primärquelle** statt einer Sammlung von Suchtreffern, sie kostet nichts,
 * unterliegt keinem Kontingent, und sie ist bei Gameserver-Images meist
 * ausführlich: gemessen 25.000 Zeichen bei `lloesche/valheim-server`, 15.000 bei
 * `mornedhels/enshrouded-server`, 8.000 bei `ryshe/terraria` — jeweils mit den
 * echten Variablennamen darin.
 *
 * Für die Ausnahmen — `itzg/minecraft-server` hat nur 1.400 Zeichen und
 * verweist nach außen — kommt das README des verlinkten GitHub-Repos dazu.
 */

export interface ImageDoku {
  /** Zusammengetragener Text für das Modell. */
  text: string;
  /** Woher die Teile stammen, für die Belege im Editor. */
  quellen: string[];
}

const ZEICHEN_GRENZE = 60_000;
const KURZ = 2_500;

/**
 * `owner/name` oder `name` (dann `library/name`). Ein Tag wird abgeschnitten —
 * die Dokumentation hängt am Repository, nicht an der Fassung.
 */
function repoPfad(image: string): string | null {
  const ohneTag = image.split(':')[0]?.trim();
  if (!ohneTag) return null;
  // Images einer eigenen Registry (mit Host) kennt die Docker-Hub-API nicht.
  if (ohneTag.split('/')[0]?.includes('.')) return null;

  const teile = ohneTag.split('/').filter(Boolean);
  if (teile.length === 1) return `library/${teile[0]}`;
  if (teile.length === 2) return `${teile[0]}/${teile[1]}`;
  return null;
}

async function hole(url: string, timeoutMs = 15_000): Promise<string | null> {
  const abbruch = AbortSignal.timeout(timeoutMs);
  try {
    const antwort = await fetch(url, {
      signal: abbruch,
      headers: { accept: 'application/json, text/plain, */*' },
    });
    if (!antwort.ok) return null;
    return await antwort.text();
  } catch {
    // Ein fehlendes README ist kein Fehler — es macht die Belege nur dünner.
    return null;
  }
}

/**
 * Leitet das GitHub-Repository aus den Links einer Beschreibung ab. Fast jedes
 * Image verlinkt sein Repo irgendwo, meist über einen Issues- oder Badge-Link.
 */
function githubRepo(text: string): string | null {
  const treffer = text.matchAll(/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/g);
  for (const t of treffer) {
    const besitzer = t[1];
    const name = t[2]?.replace(/\.git$/, '');
    if (!besitzer || !name) continue;
    // `sponsors`, `features` und Ähnliches sind keine Repositories.
    if (['sponsors', 'features', 'apps', 'orgs', 'topics'].includes(besitzer)) continue;
    return `${besitzer}/${name}`;
  }
  return null;
}

export async function imageDokuHolen(image: string): Promise<ImageDoku> {
  const pfad = repoPfad(image);
  if (!pfad) {
    throw new Error(
      `„${image}“ sieht nicht wie ein Docker-Hub-Image aus. Erwartet wird benutzer/name.`,
    );
  }

  const roh = await hole(`https://hub.docker.com/v2/repositories/${pfad}/`);
  if (!roh) {
    throw new Error(
      `Das Image „${image}“ ist auf Docker Hub nicht auffindbar. Schreibweise prüfen.`,
    );
  }

  let beschreibung = '';
  try {
    const daten = JSON.parse(roh) as { full_description?: unknown };
    beschreibung = typeof daten.full_description === 'string' ? daten.full_description : '';
  } catch {
    throw new Error('Die Antwort von Docker Hub war unlesbar.');
  }

  const teile: string[] = [];
  const quellen: string[] = [];

  if (beschreibung.trim()) {
    teile.push(`### Beschreibung auf Docker Hub (${pfad})\n\n${beschreibung}`);
    quellen.push(`https://hub.docker.com/r/${pfad}`);
  }

  // Das README des Repos ergänzt eine dünne Beschreibung — und schadet auch
  // dann nicht, wenn sie schon ausführlich ist.
  const repo = githubRepo(beschreibung);
  if (repo && (beschreibung.length < KURZ || !beschreibung.includes('ENV'))) {
    for (const datei of ['README.md', 'readme.md']) {
      const readme = await hole(`https://raw.githubusercontent.com/${repo}/HEAD/${datei}`);
      if (readme && readme.trim()) {
        teile.push(`### README des Repositories (${repo})\n\n${readme}`);
        quellen.push(`https://github.com/${repo}`);
        break;
      }
    }
  }

  if (teile.length === 0) {
    throw new Error(
      `Für „${image}“ ist keine Dokumentation auffindbar — weder auf Docker Hub noch im verlinkten Repository. ` +
        'Die Vorlage muss von Hand angelegt werden.',
    );
  }

  // Sehr lange Dokumentationen beschneiden: mehr passt nicht sinnvoll in eine
  // Anfrage, und das Wesentliche steht bei Images am Anfang.
  let text = teile.join('\n\n---\n\n');
  if (text.length > ZEICHEN_GRENZE) {
    text = `${text.slice(0, ZEICHEN_GRENZE)}\n\n[… gekürzt]`;
  }

  return { text, quellen };
}

import { join, normalize, resolve, sep } from 'node:path';
import { getTemplate } from '@gsp/shared';
import type { InstanceRecord } from '../db/store.js';

/** Wurzel der Bind-Mounts einer Instanz auf dem Host. */
export function instanceRoot(volumeDir: string, instanceId: string): string {
  return join(volumeDir, instanceId);
}

/** Host-Pfad eines Volumes, z. B. `<volumeDir>/<id>/data`. */
export function volumePath(volumeDir: string, instanceId: string, volumeName: string): string {
  return join(instanceRoot(volumeDir, instanceId), volumeName);
}

/**
 * Übersetzt einen Container-Pfad in den zugehörigen Host-Pfad. Passt kein
 * Volume, wird `null` zurückgegeben — so kann eine Vorlage keinen beliebigen
 * Ort des Hosts adressieren.
 */
export function toHostPath(
  volumeDir: string,
  instance: InstanceRecord,
  containerPath: string,
): string | null {
  const template = getTemplate(instance.game);
  const target = normalize(containerPath);

  // Längster passender Präfix gewinnt, damit `/config/worlds_local` nicht
  // versehentlich über ein Volume `/` aufgelöst wird.
  const volumes = [...template.volumes].sort(
    (a, b) => b.containerPath.length - a.containerPath.length,
  );
  for (const volume of volumes) {
    const base = normalize(volume.containerPath);
    if (target !== base && !target.startsWith(base.endsWith(sep) ? base : base + sep)) continue;
    const relative = target.slice(base.length).replace(/^[/\\]+/, '');
    const host = resolve(volumePath(volumeDir, instance.id, volume.name), relative);
    return isInside(volumePath(volumeDir, instance.id, volume.name), host) ? host : null;
  }
  return null;
}

/** Verhindert, dass ein zusammengesetzter Pfad aus seinem Wurzelverzeichnis ausbricht. */
export function isInside(root: string, candidate: string): boolean {
  const normalizedRoot = resolve(root);
  const normalizedCandidate = resolve(candidate);
  return (
    normalizedCandidate === normalizedRoot ||
    normalizedCandidate.startsWith(normalizedRoot.endsWith(sep) ? normalizedRoot : normalizedRoot + sep)
  );
}

/**
 * Erzeugt aus einem Anzeigenamen einen dateisystemtauglichen Bezeichner.
 *
 * Die Umlaut-Ersetzung muss vor der Unicode-Zerlegung stehen: NFKD trennt „ö“
 * in „o“ plus kombinierendes Trema, das anschließend entfernt würde — aus
 * „Größe“ würde sonst „grosse“ statt „groesse“.
 */
export function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .normalize('NFKD')
      // Kombinierende diakritische Zeichen entfernen (é → e).
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'instanz'
  );
}

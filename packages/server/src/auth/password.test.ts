import { describe, expect, it } from 'vitest';
import { generateSecret, hashPassword, verifyPassword } from './password.js';
import { safeEqual } from './sessions.js';

describe('Passwort-Hashing', () => {
  it('bestätigt das richtige Passwort und lehnt ein falsches ab', async () => {
    const hash = await hashPassword('ein-langes-passwort');
    expect(await verifyPassword('ein-langes-passwort', hash)).toBe(true);
    expect(await verifyPassword('ein-langes-passwor', hash)).toBe(false);
  });

  it('erzeugt für dasselbe Passwort verschiedene Hashes', async () => {
    expect(await hashPassword('gleich')).not.toBe(await hashPassword('gleich'));
  });

  it('lehnt beschädigte oder fremde Hash-Formate ab, statt zu werfen', async () => {
    expect(await verifyPassword('x', 'kaputt')).toBe(false);
    expect(await verifyPassword('x', '$2b$10$abcdef')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$65536$8$1$$')).toBe(false);
  });

  it('behandelt unterschiedliche Unicode-Schreibweisen als gleiches Passwort', async () => {
    // Zusammengesetztes und vorkomponiertes ä müssen dasselbe ergeben.
    const hash = await hashPassword('pässwort-lang');
    expect(await verifyPassword('pässwort-lang', hash)).toBe(true);
  });
});

describe('generateSecret', () => {
  it('erzeugt Zeichenketten der gewünschten Länge ohne Sonderzeichen', () => {
    const secret = generateSecret(24);
    expect(secret).toHaveLength(24);
    expect(secret).toMatch(/^[A-Za-z0-9]+$/);
    expect(generateSecret(24)).not.toBe(secret);
  });
});

describe('safeEqual', () => {
  it('vergleicht Token unabhängig von der Länge ohne zu werfen', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });
});

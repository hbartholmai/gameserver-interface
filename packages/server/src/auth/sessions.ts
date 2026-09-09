import { timingSafeEqual } from 'node:crypto';
import type { Db } from '../db/index.js';
import { hashPassword, randomToken, verifyPassword } from './password.js';

export interface SessionRecord {
  id: string;
  userId: number;
  username: string;
  csrfToken: string;
}

export class AuthService {
  constructor(
    private readonly db: Db,
    private readonly ttlHours: number,
  ) {}

  /** Ob überhaupt schon ein Konto existiert — steuert den First-Run-Bildschirm. */
  needsSetup(): boolean {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
    return row.n === 0;
  }

  async createUser(username: string, password: string): Promise<number> {
    const hash = await hashPassword(password);
    const info = this.db
      .prepare('INSERT INTO users (username, password, created_at) VALUES (?, ?, ?)')
      .run(username, hash, new Date().toISOString());
    return Number(info.lastInsertRowid);
  }

  /**
   * Prüft die Zugangsdaten. Bei unbekanntem Benutzer wird trotzdem ein
   * Hash-Vergleich durchgeführt, damit die Antwortzeit nicht verrät, ob der
   * Benutzername existiert.
   */
  async verifyCredentials(username: string, password: string): Promise<number | null> {
    const row = this.db
      .prepare('SELECT id, password FROM users WHERE username = ?')
      .get(username) as { id: number; password: string } | undefined;
    if (!row) {
      await verifyPassword(password, DUMMY_HASH);
      return null;
    }
    const ok = await verifyPassword(password, row.password);
    return ok ? row.id : null;
  }

  createSession(userId: number): SessionRecord {
    const id = randomToken(32);
    const csrfToken = randomToken(24);
    const now = new Date();
    const expires = new Date(now.getTime() + this.ttlHours * 3600_000);
    this.db
      .prepare(
        'INSERT INTO sessions (id, user_id, csrf_token, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(id, userId, csrfToken, now.toISOString(), expires.toISOString());
    const user = this.db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as {
      username: string;
    };
    return { id, userId, username: user.username, csrfToken };
  }

  getSession(id: string | undefined): SessionRecord | null {
    if (!id) return null;
    const row = this.db
      .prepare(
        `SELECT s.id, s.user_id AS userId, s.csrf_token AS csrfToken, s.expires_at AS expiresAt, u.username
         FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.id = ?`,
      )
      .get(id) as
      | { id: string; userId: number; csrfToken: string; expiresAt: string; username: string }
      | undefined;
    if (!row) return null;
    if (new Date(row.expiresAt).getTime() < Date.now()) {
      this.destroySession(id);
      return null;
    }
    return { id: row.id, userId: row.userId, username: row.username, csrfToken: row.csrfToken };
  }

  destroySession(id: string): void {
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  }

  purgeExpired(): void {
    this.db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
  }
}

/** Konstantzeit-Vergleich für CSRF-Token. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Fester Hash für den Zeitausgleich bei unbekanntem Benutzer. Das zugehörige
 * Passwort ist unbekannt und irrelevant — verglichen wird nur die Dauer.
 */
const DUMMY_HASH =
  'scrypt$65536$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

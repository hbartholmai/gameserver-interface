import type { FastifyInstance } from 'fastify';
// Erweitert Request und Reply um `cookies`, `setCookie` und `clearCookie`.
import '@fastify/cookie';
import { loginRequestSchema, setupRequestSchema } from '@gsp/shared';
import type { AuthService } from '../auth/sessions.js';
import type { Config } from '../config.js';

export const SESSION_COOKIE = 'gsp_session';

export function cookieOptions(config: Config) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.secureCookies,
    path: '/',
    maxAge: config.sessionTtlHours * 3600,
  };
}

export async function authRoutes(
  app: FastifyInstance,
  options: { auth: AuthService; config: Config },
): Promise<void> {
  const { auth, config } = options;

  app.get('/api/auth/state', async () => ({ needsSetup: auth.needsSetup() }));

  /** Erstes Konto anlegen. Nur möglich, solange kein Benutzer existiert. */
  app.post('/api/auth/setup', async (request, reply) => {
    if (!auth.needsSetup()) {
      return reply.code(409).send({ error: 'Es existiert bereits ein Konto' });
    }
    const parsed = setupRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'Ungültige Eingabe',
        detail: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }
    const userId = await auth.createUser(parsed.data.username, parsed.data.password);
    const session = auth.createSession(userId);
    reply.setCookie(SESSION_COOKIE, session.id, cookieOptions(config));
    return { username: session.username, csrfToken: session.csrfToken };
  });

  app.post(
    '/api/auth/login',
    {
      config: {
        // Bremst das Durchprobieren von Passwörtern.
        rateLimit: { max: 10, timeWindow: '1 minute' },
      },
    },
    async (request, reply) => {
      const parsed = loginRequestSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: 'Ungültige Eingabe' });

      const userId = await auth.verifyCredentials(parsed.data.username, parsed.data.password);
      if (userId === null) {
        return reply.code(401).send({ error: 'Benutzername oder Passwort ist falsch' });
      }
      const session = auth.createSession(userId);
      reply.setCookie(SESSION_COOKIE, session.id, cookieOptions(config));
      return { username: session.username, csrfToken: session.csrfToken };
    },
  );

  app.post('/api/auth/logout', async (request, reply) => {
    const id = request.cookies[SESSION_COOKIE];
    if (id) auth.destroySession(id);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/me', async (request, reply) => {
    const session = auth.getSession(request.cookies[SESSION_COOKIE]);
    if (!session) return reply.code(401).send({ error: 'Nicht angemeldet' });
    return { username: session.username, csrfToken: session.csrfToken };
  });
}

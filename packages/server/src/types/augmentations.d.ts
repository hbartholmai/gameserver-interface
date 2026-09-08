import type { SessionRecord } from '../auth/sessions.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Wird vom Auth-Hook gesetzt; auf öffentlichen Routen `undefined`. */
    session?: SessionRecord;
  }
}

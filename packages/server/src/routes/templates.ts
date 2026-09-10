import type { FastifyInstance } from 'fastify';
import { gameIdSchema, listTemplates } from '@gsp/shared';
import type { InstanceService } from '../services/instances.js';
import { ValidationError } from '../services/instances.js';
import type { JobService } from '../services/jobs.js';
import type { TemplateService } from '../services/templates.js';
import type { DraftService } from '../services/template-ai.js';

interface Deps {
  templates: TemplateService;
  instances: InstanceService;
  jobs: JobService;
  drafts: DraftService;
}

/**
 * Vorlagen anlegen, bearbeiten, löschen — und entwerfen lassen.
 *
 * Die beiden lesenden Routen `/api/templates` und `/api/templates/:id/ports`
 * bleiben bewusst in `instances.ts`: sie beliefern den Anlege-Wizard und gehören
 * dort hin. Hier steht nur, was die Vorlagen selbst verwaltet.
 */
export async function templateRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  const { templates, jobs, drafts } = deps;

  /**
   * Übersicht für die Verwaltung. Anders als `/api/templates` liefert sie die
   * vollständigen Definitionen samt Nutzungszahl — der Wizard braucht das nicht,
   * der Editor schon.
   */
  app.get('/api/templates/manage', async () => ({ templates: templates.list() }));

  app.get<{ Params: { id: string } }>('/api/templates/:id/definition', async (request, reply) => {
    const info = templates.get(request.params.id);
    if (!info) return reply.code(404).send({ error: 'Vorlage nicht gefunden' });
    return { definition: info.definition, builtin: info.builtin, instances: info.instances };
  });

  app.post<{ Body: unknown }>('/api/templates', async (request, reply) => {
    const definition = templates.create(request.body);
    return reply.code(201).send({ definition });
  });

  app.put<{ Params: { id: string }; Body: unknown }>('/api/templates/:id', async (request) => {
    const kennung = gameIdSchema.safeParse(request.params.id);
    if (!kennung.success) throw new ValidationError('Ungültige Kennung');
    return { definition: templates.update(kennung.data, request.body) };
  });

  app.delete<{ Params: { id: string } }>('/api/templates/:id', async (request) => {
    templates.remove(request.params.id);
    return { ok: true as const };
  });

  /**
   * Ob ein Entwurf überhaupt möglich ist. Ohne API-Schlüssel blendet die
   * Oberfläche den Knopf aus, statt ihn ins Leere laufen zu lassen.
   */
  app.get('/api/templates/ki/status', async () => drafts.status());

  /**
   * Erzeugt einen Vorlagenentwurf. Läuft als Job, weil die Websuche Minuten
   * dauern kann — und liefert nur einen **Entwurf**: gespeichert wird erst,
   * wenn jemand ihn im Editor geprüft und abgeschickt hat.
   */
  app.post<{ Body: { game?: unknown; image?: unknown; notes?: unknown } }>(
    '/api/templates/ki/entwurf',
    async (request, reply) => {
      const status = drafts.status();
      if (!status.available) {
        return reply.code(503).send({ error: status.reason });
      }

      const game = String(request.body?.game ?? '').trim();
      const image = String(request.body?.image ?? '').trim();
      if (!game || !image) {
        throw new ValidationError('Spielname und Docker-Image werden gebraucht', [
          ...(game ? [] : [{ field: 'game', message: 'Spielname fehlt' }]),
          ...(image ? [] : [{ field: 'image', message: 'Docker-Image fehlt' }]),
        ]);
      }

      const vorhandene = listTemplates().map((t) => t.id);
      const job = jobs.start('draft', null, async (report) => {
        const ergebnis = await drafts.draft(
          { game, image, notes: String(request.body?.notes ?? ''), takenIds: vorhandene },
          report,
        );
        drafts.remember(job.id, ergebnis);
      });

      return { job };
    },
  );

  /** Holt das Ergebnis eines abgeschlossenen Entwurfs-Jobs ab. */
  app.get<{ Params: { jobId: string } }>('/api/templates/ki/entwurf/:jobId', async (request, reply) => {
    const ergebnis = drafts.take(request.params.jobId);
    if (!ergebnis) return reply.code(404).send({ error: 'Kein Entwurf zu diesem Job' });
    return ergebnis;
  });
}

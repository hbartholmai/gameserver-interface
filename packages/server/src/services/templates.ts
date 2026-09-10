import {
  BUILTIN_DEFINITIONS,
  compileTemplate,
  renderFakeLine,
  setTemplates,
  templateDefinitionSchema,
  type GameTemplate,
  type TemplateDefinition,
} from '@gsp/shared';
import type { Store } from '../db/store.js';
import { ValidationError } from './instances.js';

export interface TemplateInfo {
  definition: TemplateDefinition;
  /** Mitgeliefert — nur eine Beschriftung, keine Sperre: auch sie sind editierbar. */
  builtin: boolean;
  /** Stand der Vorlage; Instanzen merken sich ihn beim Erzeugen des Containers. */
  rev: string;
  /** Anzahl Instanzen, die darauf beruhen. */
  instances: number;
}

/**
 * Hält die Vorlagen in der Datenbank und die kompilierte Registry im Speicher
 * synchron. Nach jeder Änderung wird neu geladen — die Registry ist damit die
 * einzige Stelle, an der Dienste und Routen Vorlagen nachschlagen.
 */
export class TemplateService {
  constructor(private readonly store: Store) {}

  /**
   * Beim Start: fehlende mitgelieferte Vorlagen ergänzen, dann alles laden.
   *
   * Vorhandene werden **nicht** angefasst. Ein Panel-Update darf die Änderungen
   * des Betreibers nicht zurücksetzen — das wäre der teuerste Fehler in diesem
   * Entwurf, weil er lautlos passiert und erst beim nächsten Containerbau auffällt.
   */
  seedAndLoad(): { seeded: string[]; nachgeruestet: string[] } {
    const jetzt = new Date().toISOString();
    const seeded: string[] = [];

    for (const definition of BUILTIN_DEFINITIONS) {
      const neu = this.store.insertTemplateIfMissing(
        definition.id,
        JSON.stringify(definition),
        true,
        jetzt,
      );
      if (neu) seeded.push(definition.id);
    }

    const nachgeruestet = this.ruesteWeltNach();
    this.reload();
    return { seeded, nachgeruestet };
  }

  /**
   * Ergänzt bestehenden Zeilen den Weltblock.
   *
   * Nötig, weil Seeding vorhandene Vorlagen nie überschreibt — ohne diesen
   * Schritt hätte auf jeder bestehenden Installation keine Vorlage ein `world`,
   * und der Welt-Reiter erschiene einfach nicht. Ohne Fehlermeldung, ohne
   * Hinweis, für immer.
   *
   * Die Zusage des Seedings bleibt trotzdem gewahrt: ergänzt wird **nur** der
   * eine fehlende Schlüssel, und nur bei mitgelieferten Vorlagen. Ein Betreiber
   * kann `world` bis hierher nicht selbst gesetzt haben — das Feld gab es nicht.
   *
   * `updated_at` bleibt stehen. Sonst meldeten alle bestehenden Instanzen
   * „Vorlage geändert“ und die Oberfläche böte grundlos „Neu aufbauen“ an — der
   * Container ändert sich durch `world` aber nicht.
   */
  private ruesteWeltNach(): string[] {
    const ergaenzt: string[] = [];
    for (const definition of BUILTIN_DEFINITIONS) {
      if (!definition.world) continue;
      const row = this.store.getTemplateRow(definition.id);
      if (!row) continue;

      let gespeichert: Record<string, unknown>;
      try {
        gespeichert = JSON.parse(row.definition) as Record<string, unknown>;
      } catch {
        // Eine kaputte Zeile darf den Start nicht verhindern; `reload()` lässt
        // sie ohnehin aus.
        continue;
      }
      if ('world' in gespeichert) continue;

      gespeichert.world = definition.world;
      this.store.upsertTemplate(
        definition.id,
        JSON.stringify(gespeichert),
        row.builtin === 1,
        row.updated_at,
      );
      ergaenzt.push(definition.id);
    }
    return ergaenzt;
  }

  /** Liest alle Vorlagen aus der Datenbank und ersetzt die Registry. */
  reload(): void {
    const templates: GameTemplate[] = [];
    for (const row of this.store.listTemplateRows()) {
      const geparst = this.parse(row.definition, row.id);
      if (!geparst) continue;
      templates.push(compileTemplate(geparst));
    }
    setTemplates(templates);
  }

  list(): TemplateInfo[] {
    const infos: TemplateInfo[] = [];
    for (const row of this.store.listTemplateRows()) {
      const definition = this.parse(row.definition, row.id);
      if (!definition) continue;
      infos.push({
        definition,
        builtin: row.builtin === 1,
        rev: row.updated_at,
        instances: this.store.countInstancesByGame(row.id),
      });
    }
    return infos;
  }

  get(id: string): TemplateInfo | null {
    const row = this.store.getTemplateRow(id);
    if (!row) return null;
    const definition = this.parse(row.definition, row.id);
    if (!definition) return null;
    return {
      definition,
      builtin: row.builtin === 1,
      rev: row.updated_at,
      instances: this.store.countInstancesByGame(row.id),
    };
  }

  /** Stand der Vorlage, wie er in `instances.template_rev` landet. */
  revOf(id: string): string | null {
    return this.store.getTemplateRow(id)?.updated_at ?? null;
  }

  create(eingabe: unknown): TemplateDefinition {
    const definition = this.validate(eingabe);
    if (this.store.getTemplateRow(definition.id)) {
      throw new ValidationError(`Es gibt bereits eine Vorlage mit der Kennung „${definition.id}“`, [
        { field: 'id', message: 'Kennung ist bereits vergeben' },
      ]);
    }
    this.store.upsertTemplate(definition.id, JSON.stringify(definition), false, new Date().toISOString());
    this.reload();
    return definition;
  }

  update(id: string, eingabe: unknown): TemplateDefinition {
    const vorhanden = this.store.getTemplateRow(id);
    if (!vorhanden) throw new ValidationError('Vorlage nicht gefunden');

    const definition = this.validate(eingabe);
    if (definition.id !== id) {
      // Die Kennung steckt in Container-Labels und Instanzdatensätzen; ein
      // Umbenennen wäre eine Migration, kein Formularfeld.
      throw new ValidationError('Die Kennung einer Vorlage lässt sich nicht ändern', [
        { field: 'id', message: 'Kennung ist unveränderlich' },
      ]);
    }

    this.store.upsertTemplate(id, JSON.stringify(definition), vorhanden.builtin === 1, new Date().toISOString());
    this.reload();
    return definition;
  }

  remove(id: string): void {
    const vorhanden = this.store.getTemplateRow(id);
    if (!vorhanden) throw new ValidationError('Vorlage nicht gefunden');

    const anzahl = this.store.countInstancesByGame(id);
    if (anzahl > 0) {
      throw new ValidationError(
        `Die Vorlage wird von ${anzahl} Instanz${anzahl === 1 ? '' : 'en'} genutzt und kann nicht gelöscht werden`,
      );
    }

    this.store.deleteTemplate(id);
    this.reload();
  }

  /**
   * Prüft die Eingabe gegen das Schema und darüber hinaus die Zusagen, die
   * Dienste an anderer Stelle voraussetzen. Ohne diese Prüfungen ließe sich
   * eine Vorlage speichern, die erst beim Anlegen einer Instanz auffällt.
   */
  private validate(eingabe: unknown): TemplateDefinition {
    const geparst = templateDefinitionSchema.safeParse(eingabe);
    if (!geparst.success) {
      throw new ValidationError(
        'Die Vorlage ist unvollständig',
        geparst.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      );
    }
    const definition = geparst.data;
    const fehler: { field: string; message: string }[] = [];

    const feldIds = new Set(definition.fields.map((f) => f.id));
    const portNamen = new Set(definition.ports.map((p) => p.name));

    if (feldIds.size !== definition.fields.length) {
      fehler.push({ field: 'fields', message: 'Feldkennungen müssen eindeutig sein' });
    }
    if (portNamen.size !== definition.ports.length) {
      fehler.push({ field: 'ports', message: 'Portnamen müssen eindeutig sein' });
    }

    // Verweise der Env-Abbildung müssen ins Leere zeigen können, sonst stünde
    // die Variable später einfach leer im Container.
    for (const [index, mapping] of definition.env.entries()) {
      if (mapping.source.kind === 'field' && !feldIds.has(mapping.source.field)) {
        fehler.push({ field: `env.${index}`, message: `Unbekanntes Feld „${mapping.source.field}“` });
      }
      if (mapping.source.kind === 'port' && !portNamen.has(mapping.source.port)) {
        fehler.push({ field: `env.${index}`, message: `Unbekannter Port „${mapping.source.port}“` });
      }
      if (mapping.source.kind === 'rconPassword' && definition.capabilities.console !== 'rcon') {
        fehler.push({
          field: `env.${index}`,
          message: 'Ein RCON-Passwort gibt es nur bei Vorlagen mit console: rcon',
        });
      }
    }

    for (const [index, regel] of definition.validations.entries()) {
      if (!feldIds.has(regel.field)) {
        fehler.push({ field: `validations.${index}`, message: `Unbekanntes Feld „${regel.field}“` });
      }
    }

    // Backup-Pfade müssen in einem Volume liegen, sonst sichert das Panel nichts.
    for (const [index, pfad] of definition.backup.paths.entries()) {
      const drin = definition.volumes.some((v) => pfad === v.containerPath || pfad.startsWith(`${v.containerPath}/`));
      if (!drin) {
        fehler.push({
          field: `backup.paths.${index}`,
          message: `„${pfad}“ liegt in keinem der deklarierten Volumes`,
        });
      }
    }
    if (definition.backup.preCommands.length > 0 && definition.capabilities.console !== 'rcon') {
      fehler.push({
        field: 'backup.preCommands',
        message: 'Vorbefehle brauchen eine Konsole (console: rcon)',
      });
    }

    /*
     * Weltdaten. Was hier durchrutscht, fällt erst beim ersten Austausch auf —
     * im ungünstigsten Fall, nachdem die bisherige Welt schon weg war.
     */
    const world = definition.world;
    if (world) {
      const inVolume = definition.volumes.some(
        (v) => world.parent === v.containerPath || world.parent.startsWith(`${v.containerPath}/`),
      );
      if (!inVolume) {
        fehler.push({
          field: 'world.parent',
          message: `„${world.parent}“ liegt in keinem der deklarierten Volumes`,
        });
      }

      /*
       * Vor dem Überschreiben legt das Panel eine Sicherung an, und die sichert
       * `backup.paths`. Läge die Welt außerhalb, wäre die Sicherung wertlos und
       * der Austausch unumkehrbar — die einzige Prüfung hier, die eine Vorlage
       * aus Sicherheitsgründen ablehnt und nicht der Form wegen.
       *
       * Bei einem festen Namen wird der ganze Weltpfad geprüft: Enshrouded
       * sichert `/opt/enshrouded/savegame`, während `parent` das Volume darüber
       * ist. Bei einem Namen aus einem Feld steht der Pfad erst zur Laufzeit
       * fest, dort muss `parent` selbst abgedeckt sein.
       */
      const zuPruefen =
        world.name.kind === 'const'
          ? `${world.parent.replace(/\/+$/, '')}/${world.name.value}`
          : world.parent;
      const gesichert = definition.backup.paths.some(
        (p) => zuPruefen === p || zuPruefen.startsWith(`${p}/`),
      );
      if (!gesichert) {
        fehler.push({
          field: 'world.parent',
          message:
            'Die Weltdaten müssen von den Backup-Pfaden abgedeckt sein — sonst gäbe es vor dem Austausch keine Sicherung',
        });
      }

      if (world.name.kind === 'field' && !feldIds.has(world.name.field)) {
        fehler.push({ field: 'world.name', message: `Unbekanntes Feld „${world.name.field}“` });
      }
      if (world.name.kind === 'const' && /[\\/:]/.test(world.name.value)) {
        fehler.push({ field: 'world.name', message: 'Der Weltname darf keine Pfadanteile enthalten' });
      }

      // Der erste Teil ist die Welt selbst; ohne ihn gäbe es nichts zu tauschen.
      if (world.parts[0]?.required !== true) {
        fehler.push({ field: 'world.parts.0', message: 'Der erste Teil ist die Welt selbst und muss erforderlich sein' });
      }
      const suffixe = new Set(world.parts.map((t) => t.suffix));
      if (suffixe.size !== world.parts.length) {
        fehler.push({ field: 'world.parts', message: 'Die Endungen der Teile müssen eindeutig sein' });
      }
      for (const [index, teil] of world.parts.entries()) {
        if (/[\\/:]/.test(teil.suffix)) {
          fehler.push({ field: `world.parts.${index}`, message: 'Eine Endung darf keine Pfadanteile enthalten' });
        }
      }
      for (const [index, endung] of world.accept.entries()) {
        if (!endung.startsWith('.')) {
          fehler.push({ field: `world.accept.${index}`, message: 'Endungen beginnen mit einem Punkt, etwa .wld' });
        }
      }
    }

    if (definition.capabilities.mods === 'none' && definition.modsPath) {
      fehler.push({ field: 'modsPath', message: 'Ohne Mod-Unterstützung gibt es kein Mod-Verzeichnis' });
    }
    if (definition.capabilities.mods !== 'none' && !definition.modsPath) {
      fehler.push({ field: 'modsPath', message: 'Mod-Unterstützung braucht ein Mod-Verzeichnis' });
    }
    if (definition.capabilities.players === 'a2s' && !definition.adapter.queryPortName) {
      fehler.push({
        field: 'adapter.queryPortName',
        message: 'Für die Steam-Abfrage muss der Abfrageport benannt sein',
      });
    }
    if (definition.adapter.queryPortName && !portNamen.has(definition.adapter.queryPortName)) {
      fehler.push({ field: 'adapter.queryPortName', message: 'Unbekannter Port' });
    }
    if (definition.adapter.maxPlayersField && !feldIds.has(definition.adapter.maxPlayersField)) {
      fehler.push({ field: 'adapter.maxPlayersField', message: 'Unbekanntes Feld' });
    }

    // Konsole und Spielerliste sind unabhängig, beide brauchen aber ihren Port.
    if (definition.capabilities.console === 'rcon' || definition.capabilities.players === 'rcon') {
      const name = definition.adapter.rconPortName ?? 'rcon';
      if (!portNamen.has(name)) {
        fehler.push({
          field: 'adapter.rconPortName',
          message: `Für RCON muss ein Port „${name}“ deklariert sein`,
        });
      }
    }
    // Kick und Bann laufen ausschließlich über RCON — ohne Konsole gäbe die
    // Oberfläche Knöpfe aus, die nur `UnsupportedError` liefern könnten.
    if (definition.capabilities.moderation && definition.capabilities.console !== 'rcon') {
      fehler.push({
        field: 'capabilities.moderation',
        message: 'Kick und Bann brauchen eine Konsole (console: rcon)',
      });
    }
    if (definition.adapter.rconListFormat && definition.capabilities.players !== 'rcon') {
      fehler.push({
        field: 'adapter.rconListFormat',
        message: 'Ein Listenformat ergibt nur bei players: rcon einen Sinn',
      });
    }

    // Muster werden gegen jede Logzeile ausgeführt. Ein unübersetzbares Muster
    // soll beim Speichern auffallen, nicht im laufenden Betrieb.
    for (const [name, spec] of [
      ['logPatterns.join', definition.logPatterns.join],
      ['logPatterns.ready', definition.logPatterns.ready],
      ['logPatterns.leave', definition.logPatterns.leave],
      ['logPatterns.clean', definition.logPatterns.clean?.pattern],
    ] as const) {
      if (!spec) continue;
      if (spec.source.length > 400) {
        fehler.push({ field: name, message: 'Muster ist zu lang (höchstens 400 Zeichen)' });
        continue;
      }
      // Verschachtelte Quantoren sind die übliche Ursache katastrophaler
      // Laufzeiten; Node kennt keine RegExp-Zeitgrenze, mit der man sie auffangen könnte.
      if (/(\([^)]*[+*][^)]*\)|\[[^\]]*\][+*])\s*[+*]/.test(spec.source)) {
        fehler.push({
          field: name,
          message: 'Verschachtelte Wiederholungen sind nicht erlaubt — sie können das Panel blockieren',
        });
        continue;
      }
      try {
        new RegExp(spec.source, spec.flags);
      } catch (err) {
        fehler.push({ field: name, message: err instanceof Error ? err.message : 'Ungültiges Muster' });
      }
    }

    /*
     * Wenn Beispielzeilen angegeben sind, müssen sie zu den Mustern derselben
     * Vorlage passen. Sonst erkennt der Log-Parser im Betrieb ohne Docker
     * nichts — die Instanz bliebe für immer auf „Startet“ stehen, und der
     * Fehler fiele erst beim Ausprobieren auf. Für die mitgelieferten Vorlagen
     * prüft das ein Test; hier gilt dasselbe für selbst angelegte.
     */
    if (definition.fakeLog && fehler.length === 0) {
      const muster = compileTemplate(definition).logPatterns;
      const beitritt = renderFakeLine(definition.fakeLog, 'join', 'Testspieler', 42);
      if (muster.join.exec(beitritt)?.[1] !== 'Testspieler') {
        fehler.push({
          field: 'fakeLog.join',
          message: `„${beitritt}“ passt nicht zum Beitrittsmuster — Gruppe 1 muss der Spielername sein`,
        });
      }
      const start = renderFakeLine(definition.fakeLog, 'ready', '', 1200);
      if (!muster.ready.test(start)) {
        fehler.push({
          field: 'fakeLog.ready',
          message: `„${start}“ passt nicht zum Startmuster — die Instanz käme nie über „Startet“ hinaus`,
        });
      }
      if (muster.leave) {
        const abgang = renderFakeLine(definition.fakeLog, 'leave', 'Testspieler', 9001);
        if (muster.leave.exec(abgang)?.[1] !== 'Testspieler') {
          fehler.push({
            field: 'fakeLog.leave',
            message: `„${abgang}“ passt nicht zum Abgangsmuster`,
          });
        }
      }
    }

    if (fehler.length > 0) throw new ValidationError('Die Vorlage ist nicht schlüssig', fehler);
    return definition;
  }

  private parse(json: string, id: string): TemplateDefinition | null {
    try {
      const geparst = templateDefinitionSchema.safeParse(JSON.parse(json));
      return geparst.success ? geparst.data : null;
    } catch {
      // Eine kaputte Zeile darf nicht den Start verhindern; die betroffene
      // Vorlage fehlt dann in der Registry und ihre Instanzen melden 404.
      void id;
      return null;
    }
  }
}

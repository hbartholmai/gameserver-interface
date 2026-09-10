import type { LogLevel } from '../schema/common.js';
import type {
  ArgMapping,
  EnvMapping,
  PatternSpec,
  TemplateDefinition,
  ValidationRule,
} from '../schema/template-definition.js';
import type {
  FieldValues,
  GameTemplate,
  LogPatterns,
  TemplateContext,
} from '../schema/template.js';
import { levelFromKeywords } from './util.js';

/**
 * Baut aus einer gespeicherten Definition wieder eine lauffähige Vorlage.
 * Alles, was früher als Funktion im Quelltext stand — die Env-Abbildung, die
 * Log-Muster, die spielspezifischen Prüfungen — entsteht hier aus Daten.
 */
export function compileTemplate(def: TemplateDefinition): GameTemplate {
  return {
    id: def.id,
    label: def.label,
    summary: def.summary,
    image: def.image,
    defaultTag: def.defaultTag,
    defaultMemoryMb: def.defaultMemoryMb,
    defaultCpus: def.defaultCpus,
    notes: def.notes,
    capabilities: def.capabilities,
    ports: def.ports,
    volumes: def.volumes,
    fields: def.fields,

    env: (values, ctx) => buildEnv(def.env, values, ctx),
    args: (values, ctx) => buildArgs(def.args ?? [], values, ctx),
    logPatterns: buildLogPatterns(def),
    backup: {
      paths: def.backup.paths,
      ...(def.backup.preCommands.length > 0 ? { preCommands: def.backup.preCommands } : {}),
      ...(def.backup.postCommands.length > 0 ? { postCommands: def.backup.postCommands } : {}),
    },
    ...(def.modsPath !== undefined ? { modsPath: def.modsPath } : {}),
    modExtensions: def.modExtensions,
    ...(def.world !== undefined ? { world: def.world } : {}),

    definition: def,
  };
}

// --- Umgebung ---------------------------------------------------------------

function buildEnv(
  mappings: EnvMapping[],
  values: FieldValues,
  ctx: TemplateContext,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const mapping of mappings) {
    const wert = resolveEnv(mapping, values, ctx);
    if (wert === null) continue;
    env[mapping.name] = wert;
  }
  return env;
}

/** `null` bedeutet: Variable weglassen. */
function resolveEnv(
  mapping: EnvMapping,
  values: FieldValues,
  ctx: TemplateContext,
): string | null {
  let roh: string | number | boolean | undefined;

  switch (mapping.source.kind) {
    case 'const':
      roh = mapping.source.value;
      break;
    case 'field':
      roh = values[mapping.source.field];
      break;
    case 'port':
      roh = ctx.hostPorts[mapping.source.port];
      break;
    case 'rconPassword':
      roh = ctx.rconPassword;
      break;
    case 'timezone':
      roh = ctx.timezone;
      break;
  }

  // Booleans übersetzen die Images sehr unterschiedlich (`TRUE`, `true`,
  // `-crossplay`), deshalb ist die Abbildung Teil der Definition.
  if (typeof roh === 'boolean' && mapping.boolean) {
    return roh ? mapping.boolean.whenTrue : mapping.boolean.whenFalse;
  }

  let text = roh === undefined || roh === null ? mapping.fallback : String(roh);
  if (text === undefined) text = '';
  if (mapping.trim) text = text.trim();

  if (mapping.omitWhenEmpty && text === '') return null;
  return text;
}

/**
 * Baut die Startargumente. Ein Eintrag wird zu einem oder zwei Elementen:
 * `{flag: '-world', source: …}` ergibt `['-world', 'welt.wld']`, ein Eintrag
 * ohne Quelle nur das Flag selbst.
 */
function buildArgs(mappings: ArgMapping[], values: FieldValues, ctx: TemplateContext): string[] {
  const args: string[] = [];
  for (const mapping of mappings) {
    if (!mapping.source) {
      // Reines Schalterargument ohne Wert.
      if (mapping.flag) args.push(mapping.flag);
      continue;
    }
    const wert = resolveEnv(
      {
        name: '',
        source: mapping.source,
        ...(mapping.fallback !== undefined ? { fallback: mapping.fallback } : {}),
        ...(mapping.boolean ? { boolean: mapping.boolean } : {}),
        trim: mapping.trim,
        omitWhenEmpty: mapping.omitWhenEmpty,
      },
      values,
      ctx,
    );
    if (wert === null) continue;
    if (mapping.flag) args.push(mapping.flag);
    args.push(wert);
  }
  return args;
}

// --- Log --------------------------------------------------------------------

function toRegExp(spec: PatternSpec): RegExp {
  return new RegExp(spec.source, spec.flags);
}

function buildLogPatterns(def: TemplateDefinition): LogPatterns {
  const clean = def.logPatterns.clean;
  const cleanRe = clean ? toRegExp(clean.pattern) : null;
  const cleanErsatz = clean?.replacement ?? '';

  const level = def.logPatterns.level;
  const fehlerRe = level && level.error.length > 0 ? woerter(level.error) : null;
  const warnRe = level && level.warn.length > 0 ? woerter(level.warn) : null;

  return {
    join: toRegExp(def.logPatterns.join),
    ...(def.logPatterns.leave ? { leave: toRegExp(def.logPatterns.leave) } : {}),
    ready: toRegExp(def.logPatterns.ready),
    level:
      fehlerRe || warnRe
        ? (line: string): LogLevel => {
            if (fehlerRe?.test(line)) return 'ERROR';
            if (warnRe?.test(line)) return 'WARN';
            return 'INFO';
          }
        : levelFromKeywords,
    ...(cleanRe
      ? {
          // Das abschließende Beschneiden hatten alle ursprünglichen Vorlagen
          // gemeinsam; es steckt jetzt hier statt in jeder Vorlage einzeln.
          clean: (line: string) => line.replace(cleanRe, cleanErsatz).trimEnd(),
        }
      : {}),
  };
}

function woerter(liste: string[]): RegExp {
  const escaped = liste.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`\\b(${escaped.join('|')})\\b`, 'i');
}

// --- Prüfungen --------------------------------------------------------------

/** Wendet die deklarativen Regeln einer Vorlage an. */
export function applyValidations(
  rules: ValidationRule[],
  values: FieldValues,
): { field: string; message: string }[] {
  const errors: { field: string; message: string }[] = [];

  for (const rule of rules) {
    const wert = String(values[rule.field] ?? '');

    switch (rule.rule) {
      case 'required':
        if (wert === '') errors.push({ field: rule.field, message: rule.message });
        break;

      case 'minLength':
        if (rule.onlyWhenSet && wert === '') break;
        if (wert.length < rule.value) errors.push({ field: rule.field, message: rule.message });
        break;

      case 'pattern':
        if (rule.onlyWhenSet && wert === '') break;
        if (!toRegExp(rule.pattern).test(wert)) {
          errors.push({ field: rule.field, message: rule.message });
        }
        break;

      case 'notContainedIn': {
        if (rule.onlyWhenSet && wert === '') break;
        const treffer = rule.fields.some((feld) => String(values[feld] ?? '').includes(wert));
        if (treffer) errors.push({ field: rule.field, message: rule.message });
        break;
      }
    }
  }

  return errors;
}

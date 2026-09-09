import { z } from 'zod';
import type { GameId } from '../schema/common.js';
import type { FieldSpec, FieldValues, GameTemplate, TemplateDescriptor } from '../schema/template.js';
import { minecraftTemplate } from './minecraft.js';
import { valheimTemplate } from './valheim.js';
import { enshroudedTemplate } from './enshrouded.js';

export const TEMPLATES: Record<GameId, GameTemplate> = {
  minecraft: minecraftTemplate,
  valheim: valheimTemplate,
  enshrouded: enshroudedTemplate,
};

export const TEMPLATE_LIST: GameTemplate[] = [minecraftTemplate, valheimTemplate, enshroudedTemplate];

export function getTemplate(game: GameId): GameTemplate {
  return TEMPLATES[game];
}

/** Reduziert eine Vorlage auf den JSON-serialisierbaren Teil für die API. */
export function toDescriptor(template: GameTemplate): TemplateDescriptor {
  const { env: _env, logPatterns: _log, backup: _backup, configFiles: _cfg, ...descriptor } = template;
  return descriptor;
}

/** Vorbelegung eines Formulars aus den Feld-Defaults. */
export function defaultValues(template: GameTemplate): FieldValues {
  const values: FieldValues = {};
  for (const field of template.fields) {
    if (field.default !== undefined) values[field.id] = field.default;
    else if (field.type === 'boolean') values[field.id] = false;
    else if (field.type === 'number') values[field.id] = field.min ?? 0;
    else values[field.id] = '';
  }
  return values;
}

/** Baut aus den Feld-Specs ein Zod-Schema, das Frontend und Backend teilen. */
export function settingsSchema(template: GameTemplate): z.ZodType<FieldValues> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of template.fields) {
    shape[field.id] = fieldSchema(field);
  }
  return z.object(shape).passthrough() as unknown as z.ZodType<FieldValues>;
}

function fieldSchema(field: FieldSpec): z.ZodTypeAny {
  switch (field.type) {
    case 'boolean':
      return z.boolean();
    case 'number': {
      let schema = z.number();
      if (field.min !== undefined) schema = schema.min(field.min, `Mindestens ${field.min}`);
      if (field.max !== undefined) schema = schema.max(field.max, `Höchstens ${field.max}`);
      return schema;
    }
    case 'select':
      return z.enum((field.options ?? []).map((o) => o.value) as [string, ...string[]]);
    case 'text':
    case 'password': {
      let schema = z.string();
      if (field.maxLength !== undefined) {
        schema = schema.max(field.maxLength, `Höchstens ${field.maxLength} Zeichen`);
      }
      return field.required ? schema.min(1, `${field.label} ist erforderlich`) : schema;
    }
  }
}

/**
 * Spielspezifische Prüfungen, die sich nicht aus den Feld-Specs ergeben.
 * Gibt eine Liste von Fehlern je Feld zurück; leer bedeutet gültig.
 */
export function validateSettings(
  template: GameTemplate,
  values: FieldValues,
): { field: string; message: string }[] {
  const errors: { field: string; message: string }[] = [];
  const parsed = settingsSchema(template).safeParse(values);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push({ field: String(issue.path[0] ?? ''), message: issue.message });
    }
  }

  if (template.id === 'valheim') {
    const pass = String(values.password ?? '');
    const serverName = String(values.serverName ?? '');
    const worldName = String(values.worldName ?? '');
    if (pass.length > 0 && pass.length < 5) {
      errors.push({ field: 'password', message: 'Valheim verlangt mindestens 5 Zeichen' });
    }
    if (pass && (serverName.includes(pass) || worldName.includes(pass))) {
      errors.push({
        field: 'password',
        message: 'Das Passwort darf nicht im Server- oder Weltnamen vorkommen',
      });
    }
  }

  if (template.id === 'enshrouded') {
    if (!String(values.adminPassword ?? '')) {
      errors.push({ field: 'adminPassword', message: 'Ohne Admin-Passwort ist der Server nicht administrierbar' });
    }
  }

  if (template.id === 'minecraft') {
    const level = String(values.levelName ?? '');
    if (level && !/^[A-Za-z0-9_.-]+$/.test(level)) {
      errors.push({ field: 'levelName', message: 'Nur Buchstaben, Ziffern und . _ -' });
    }
  }

  return errors;
}

export { minecraftTemplate, valheimTemplate, enshroudedTemplate };

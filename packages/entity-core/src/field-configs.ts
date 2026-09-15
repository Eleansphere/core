import type { FieldConfig } from '@eleansphere/schema';
import type { Fields } from './entity-types';

/**
 * Translates entity-core field definitions into schema `FieldConfig`s: `writeOnly` becomes
 * be-core's `sensitive` (the flag the server checks to strip a field from responses) and is
 * dropped itself. The one place that keeps "excluded from the DTO" and "stripped from the real
 * API response" in sync.
 */
export function toFieldConfigs(fields: Fields): Record<string, FieldConfig> {
  const result: Record<string, FieldConfig> = {};
  for (const [name, field] of Object.entries(fields)) {
    const { writeOnly, ...rest } = field;
    result[name] = (writeOnly ? { ...rest, sensitive: true } : rest) as FieldConfig;
  }
  return result;
}

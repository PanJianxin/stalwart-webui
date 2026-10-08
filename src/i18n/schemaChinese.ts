import dictionary from './schema-zh.json';
import overrides from './schema-zh-overrides.json';
const phrases: Record<string, string> = { ...dictionary, ...overrides };
export function translateSchemaText(text: string): string {
  return phrases[text] ?? text;
}
// Translate display metadata only. Object IDs, field names, enum values,
// defaults, router section names and submitted values remain untouched.
const TEXT_KEYS = new Set([
  'label',
  'title',
  'subtitle',
  'description',
  'placeholder',
  'singularName',
  'pluralName',
  'keyLabel',
  'valueLabel',
]);
export function translateSchemaMetadata<T>(source: T): T {
  function visit(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value).map(([key, child]) => [
          key,
          TEXT_KEYS.has(key) && typeof child === 'string' ? translateSchemaText(child) : visit(child),
        ]),
      );
    return value;
  }
  return visit(source) as T;
}

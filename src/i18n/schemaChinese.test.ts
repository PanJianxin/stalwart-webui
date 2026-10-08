import { describe, expect, it } from 'vitest';
import { translateSchemaMetadata, translateSchemaText } from './schemaChinese';
import en from './en.json';
import zh from './zh.json';
function flatten(value: unknown, prefix = ''): Record<string, string> {
  if (typeof value === 'string') return { [prefix]: value };
  return Object.assign({}, ...Object.entries(value as object).map(([k, v]) => flatten(v, `${prefix}.${k}`)));
}
describe('Chinese administration metadata', () => {
  it('preserves all interpolation tokens and fixed UI keys', () => {
    const english = flatten(en),
      chinese = flatten(zh);
    expect(Object.keys(chinese).sort()).toEqual(Object.keys(english).sort());
    for (const [key, text] of Object.entries(english))
      expect((chinese[key].match(/{{.*?}}/g) ?? []).sort(), key).toEqual((text.match(/{{.*?}}/g) ?? []).sort());
  });
  it('translates display text while preserving wire fields, values and the input', () => {
    const source = {
      name: 'Management',
      label: 'Credentials',
      description: 'Name of the account, typically an email address local part.',
      value: 'Password',
      default: 'English',
      id: 'abc',
    };
    const result = translateSchemaMetadata(source);
    expect(result.label).toBe('登录凭据');
    expect(result.name).toBe('Management');
    expect(result.value).toBe('Password');
    expect(source.label).toBe('Credentials');
    expect(translateSchemaText('Dashboard')).toBe('运行总览');
  });
});

import { describe, expect, it } from 'vitest';
import { isLinkVisible } from './layout';
import type { Schema } from '@/types/schema';
const schema = {
  objects: {
    'x:Trace': { type: 'object', description: '', permissionPrefix: 'sysTrace', enterprise: true },
    'x:Log': { type: 'object', description: '', permissionPrefix: 'sysLog' },
  },
} as unknown as Schema;
describe('edition-aware navigation', () => {
  it('hides enterprise history and live tracing from community accounts', () => {
    expect(isLinkVisible(schema, 'x:Trace', 'community', () => true)).toBe(false);
    expect(isLinkVisible(schema, 'CustomComponent/LiveTracing', 'community', () => true)).toBe(false);
  });
  it('keeps ordinary logs visible and enterprise views accessible to licensed editions', () => {
    expect(isLinkVisible(schema, 'x:Log', 'community', () => true)).toBe(true);
    expect(isLinkVisible(schema, 'x:Trace', 'enterprise', () => true)).toBe(true);
  });
});

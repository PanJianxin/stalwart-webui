import { describe, expect, it } from 'vitest';
import { pandaSchema } from './pandaSchema';
import type { Schema } from '@/types/schema';

describe('single-tenant UI policy', () => {
  it('hides tenant navigation and ownership selectors without changing external provider tenant IDs or the source schema', () => {
    const source = {
      layouts: [
        {
          name: 'Management',
          icon: 'users',
          items: [
            {
              container: {
                name: 'Directory',
                icon: 'users',
                items: [
                  { type: 'link', name: 'Tenants', viewName: 'x:Tenant' },
                  { type: 'link', name: 'Accounts', viewName: 'x:Account/User' },
                ],
              },
            },
          ],
        },
      ],
      forms: {
        'x:Account/User': {
          sections: [
            {
              fields: [
                { name: 'memberTenantId', label: 'Tenant' },
                { name: 'name', label: 'Name' },
              ],
            },
          ],
        },
        'x:DnsServerAzureDns': { sections: [{ fields: [{ name: 'tenantId', label: 'Azure tenant ID' }] }] },
      },
      objects: { 'x:Tenant': { type: 'object' }, 'x:Account': { type: 'object' } },
    } as unknown as Schema;
    const result = pandaSchema(source);
    expect(result.objects['x:Tenant']).toBeUndefined();
    expect(result.forms['x:Account/User'].sections[0].fields.map((f) => f.name)).toEqual(['name']);
    expect(result.forms['x:DnsServerAzureDns'].sections[0].fields[0].name).toBe('tenantId');
    expect(JSON.stringify(result.layouts)).not.toContain('x:Tenant');
    expect(source.objects['x:Tenant']).toBeDefined();
  });
  it('places mail history under email delivery and never creates a top-level history item', () => {
    const source = {
      layouts: [
        {
          name: 'Management',
          icon: 'monitor',
          items: [
            {
              container: {
                name: 'Emails',
                icon: 'send',
                items: [
                  { type: 'link', name: 'Queued Messages', viewName: 'x:QueuedMessage' },
                  { type: 'link', name: 'Delivery Test', viewName: 'CustomComponent/LiveDelivery' },
                ],
              },
            },
          ],
        },
      ],
      forms: {},
      objects: {},
    } as unknown as Schema;
    const result = pandaSchema(source);
    expect(result.layouts[0].items).toHaveLength(1);
    const delivery = result.layouts[0].items[0];
    expect(
      'container' in delivery && delivery.container.items.map((item) => item.type === 'link' && item.viewName),
    ).toEqual(['x:QueuedMessage', 'CustomComponent/MailHistory', 'CustomComponent/LiveDelivery']);
    expect(JSON.stringify(source)).not.toContain('MailHistory');
  });
});

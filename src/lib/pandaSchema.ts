import type { Schema, LayoutSubItem, LayoutItem } from '@/types/schema';
import { translateSchemaMetadata, translateSchemaText } from '@/i18n/schemaChinese';

// UI policy for this single-domain installation. Server permissions are unchanged.
export function pandaSchema(source: Schema): Schema {
  const schema = translateSchemaMetadata(source);
  const hidden = (name: string) => name === 'x:Tenant' || name.startsWith('x:Tenant/');
  const children = (items: LayoutSubItem[]): LayoutSubItem[] =>
    items.flatMap<LayoutSubItem>((item) => {
      if (item.type === 'link') return hidden(item.viewName) ? [] : [{ ...item, name: translateSchemaText(item.name) }];
      const filtered = children(item.items);
      return filtered.length ? [{ ...item, name: translateSchemaText(item.name), items: filtered }] : [];
    });
  for (const layout of schema.layouts) {
    layout.items = layout.items.flatMap<LayoutItem>((item) => {
      if ('link' in item)
        return hidden(item.link.viewName)
          ? []
          : [{ link: { ...item.link, name: translateSchemaText(item.link.name) } }];
      const items = children(item.container.items);
      return items.length
        ? [{ container: { ...item.container, name: translateSchemaText(item.container.name), items } }]
        : [];
    });
  }
  for (const [name, form] of Object.entries(schema.forms)) {
    if (hidden(name)) {
      delete schema.forms[name];
      continue;
    }
    form.sections = form.sections
      .map((section) => ({
        ...section,
        fields: section.fields.filter(
          (field) => !['memberTenantId', 'defaultTenantRoleIds', 'tenants'].includes(field.name),
        ),
      }))
      .filter((section) => section.fields.length > 0);
  }
  for (const name of Object.keys(schema.objects)) if (hidden(name)) delete schema.objects[name];
  return schema;
}

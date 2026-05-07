import assert from 'node:assert/strict';
import { createQueryTemplateRepository } from '../templates/queryTemplateRepository.js';

const calls = [];
const repository = createQueryTemplateRepository({
  postJson: async payload => {
    calls.push(payload);
    return { data: { ok: true, payload } };
  }
});

assert.throws(() => createQueryTemplateRepository(), {
  name: 'TypeError'
});

assert.deepEqual(await repository.listTemplates(), {
  ok: true,
  payload: { action: 'list_templates' }
});

await repository.createTemplate({ name: 'Branch report', pinned: true });
await repository.updateTemplate('template-1', { name: 'Updated report' });
await repository.deleteTemplate({ templateId: 'template-2', name: 'Old report' });
await repository.reorderPinnedTemplates(['template-3', 'template-1']);
await repository.saveCategory({ name: 'Reports', description: 'Saved reports' });
await repository.saveCategory({ categoryId: 'reports', name: 'Reports', description: 'Updated' });
await repository.deleteCategory('reports');

assert.deepEqual(calls, [
  { action: 'list_templates' },
  { action: 'create_template', name: 'Branch report', pinned: true },
  { action: 'update_template', template_id: 'template-1', name: 'Updated report' },
  { action: 'delete_template', template_id: 'template-2', name: 'Old report' },
  { action: 'reorder_pinned_templates', template_ids: ['template-3', 'template-1'] },
  { action: 'create_template_category', category_id: undefined, name: 'Reports', description: 'Saved reports' },
  { action: 'update_template_category', category_id: 'reports', name: 'Reports', description: 'Updated' },
  { action: 'delete_template_category', category_id: 'reports' }
]);

const failingRepository = createQueryTemplateRepository({
  postJson: async () => ({ data: { error: 'Backend refused the request.' } })
});

await assert.rejects(
  () => failingRepository.listTemplates(),
  /Backend refused the request\./u
);

console.log('Query template repository logic tests passed');

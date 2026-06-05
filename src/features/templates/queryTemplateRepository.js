function createQueryTemplateRepository({ postJson } = {}) {
  if (typeof postJson !== 'function') {
    throw new TypeError('createQueryTemplateRepository requires a postJson function.');
  }

  async function sendTemplateRequest(payload) {
    const { data } = await postJson(payload);
    if (data.error) {
      throw new Error(data.error);
    }
    return data;
  }

  return Object.freeze({
    listTemplates() {
      return sendTemplateRequest({ action: 'list_templates' });
    },
    createTemplate(templatePayload = {}) {
      return sendTemplateRequest({
        action: 'create_template',
        ...templatePayload
      });
    },
    updateTemplate(templateId, templatePayload = {}) {
      return sendTemplateRequest({
        action: 'update_template',
        template_id: templateId,
        ...templatePayload
      });
    },
    deleteTemplate({ templateId, name } = {}) {
      return sendTemplateRequest({
        action: 'delete_template',
        template_id: templateId,
        name
      });
    },
    reorderPinnedTemplates(templateIds = []) {
      return sendTemplateRequest({
        action: 'reorder_pinned_templates',
        template_ids: templateIds
      });
    },
    saveCategory({ categoryId, name, description } = {}) {
      return sendTemplateRequest({
        action: categoryId ? 'update_template_category' : 'create_template_category',
        category_id: categoryId || undefined,
        name,
        description
      });
    },
    deleteCategory(categoryId) {
      return sendTemplateRequest({
        action: 'delete_template_category',
        category_id: categoryId
      });
    }
  });
}

export {
  createQueryTemplateRepository
};

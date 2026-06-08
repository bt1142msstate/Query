import { appServices } from '../../core/appServices.js';
import { QueryChangeManager, QueryStateReaders } from '../../core/queryState.js';
import { showToastMessage } from '../../core/toast.js';
import { VisibilityUtils } from '../../core/visibility.js';
import { DOM } from '../../core/domCache.js';
import { fieldDefs, isFieldBuildable, loadFieldDefinitions, removeDynamicField } from '../../features/filters/fieldDefs.js';
import { renderBuildableFieldPreview } from './buildableFieldPreview.js';
import {
  applyQueryPreviewFilterState,
  createQueryFilterPreview,
  fieldMatchesBase
} from './fieldPickerQueryPreview.js';
import {
  buildNextDisplayedFieldsForPicker,
  parseFieldPickerInsertAt
} from './fieldPickerQuerySelection.js';

function createQueryFieldPickerIntegration(options) {
  const {
    openSharedFieldPicker,
    getFieldPickerOptionsFromDefinitions
  } = options;
  const services = appServices;
  const { getDisplayedFields, getFilterGroupForField } = QueryStateReaders;

  function replaceDisplayedFieldSelection(fieldName, nextChecked, insertAt, source) {
    const nextFields = buildNextDisplayedFieldsForPicker(
      getDisplayedFields(),
      fieldName,
      nextChecked,
      insertAt,
      fieldMatchesBase
    );

    if (QueryChangeManager) {
      QueryChangeManager.replaceDisplayedFields(nextFields, { source });
    }
  }

  function createQueryPickerPreview(container, fieldName, context, insertAt) {
    const fieldDef = fieldDefs && fieldDefs.get(fieldName);
    if (isFieldBuildable(fieldDef)) {
      return renderBuildableFieldPreview({
        container,
        context,
        fieldDef,
        fieldName,
        actionLabel: insertAt >= 0 ? 'Create and insert field' : 'Create and add field',
        onCreated: dynamicFieldName => {
          replaceDisplayedFieldSelection(
            dynamicFieldName,
            true,
            insertAt,
            'SharedFieldPicker.addDynamicDisplayedField'
          );

          return {
            successMessage: `${dynamicFieldName} added to results.`
          };
        }
      });
    }

    if (insertAt >= 0) {
      return null;
    }

    return createQueryFilterPreview(container, fieldName, context);
  }

  function openQueryFilterEditor(fieldName) {
    const fieldDef = fieldDefs && fieldDefs.get(fieldName);
    if (!fieldDef || !services.bubble || typeof services.bubble.Bubble !== 'function') {
      return false;
    }
    const bubble = new services.bubble.Bubble(fieldDef).getElement();
    const overlay = DOM?.overlay || document.getElementById('overlay');
    const conditionPanel = services.bubble?.getConditionPanelElement ? services.bubble.getConditionPanelElement() : null;
    const inputWrapper = services.getBubbleInputWrapperElement();
    let filterCard = services.getBubbleFilterCardElement();

    if (filterCard && !DOM?.filterCard) {
      document.body.appendChild(filterCard);
      filterCard.offsetHeight;
    }
    if (filterCard) {
      services.prepareBubbleFilterCardForOpen(filterCard);
    }

    if (overlay) {
      overlay.classList.add('show');
    }
    VisibilityUtils.acquireRaisedUi('bubble-editor');

    services.buildBubbleConditionPanel(bubble);

    if (filterCard) {
      const titleEl = services.getBubbleFilterCardTitleElement(filterCard);
      if (titleEl) titleEl.textContent = fieldName;
    }

    services.renderConditionList(fieldName);

    if (conditionPanel) {
      conditionPanel.classList.add('show');
    }
    if (filterCard) {
      if (!services.markBubbleFilterCardOpen(filterCard, { scrollReadyDelay: 240 })) {
        filterCard.classList.add('show', 'content-ready');
      }
    }
    if (inputWrapper && getFilterGroupForField(fieldName)) {
      inputWrapper.classList.add('show');
    }

    return true;
  }

  async function openQueryFieldPicker(pickerOptions = {}) {
    const insertAt = parseFieldPickerInsertAt(pickerOptions.insertAt);

    await openSharedFieldPicker({
      beforeOpen: async () => {
        if (typeof loadFieldDefinitions === 'function') {
          await loadFieldDefinitions();
        }
      },
      labels: {
        kicker: insertAt >= 0 ? '' : 'Add Field',
        title: 'Choose a field for this query',
        description: insertAt >= 0
          ? 'Click a field to insert it into results at this position.'
          : 'Select a field to add it to results, then optionally set a filter right away.',
        filterChoice: 'Open filter editor',
        footerNote: insertAt >= 0 ? 'Fields insert into results immediately.' : 'Filters are added automatically once the preview has a value.'
      },
      autoApplyDisplayOnOptionClick: insertAt >= 0,
      autoDisplayOnSelect: insertAt < 0,
      showDisplayChoice: false,
      compactLayout: false,
      autoAddFilterFromPreview: insertAt < 0,
      getOptions: getFieldPickerOptionsFromDefinitions,
      getFieldState: fieldName => ({
        display: getDisplayedFields().some(column => fieldMatchesBase(column, fieldName)),
        filter: Boolean(getFilterGroupForField(fieldName)?.filters?.length)
      }),
      renderFilterPreview: (container, fieldName, context = {}) => createQueryPickerPreview(
        container,
        fieldName,
        context,
        insertAt
      ),
      onDisplayChange: async (fieldName, nextChecked) => {
        replaceDisplayedFieldSelection(
          fieldName,
          nextChecked,
          insertAt,
          'SharedFieldPicker.toggleDisplayedField'
        );

        showToastMessage(
          nextChecked ? `${fieldName} added to results.` : `${fieldName} removed from results.`,
          'success'
        );
      },
      onFilterPreviewChange: insertAt < 0 ? async (fieldName, previewState) => {
        applyQueryPreviewFilterState(fieldName, previewState);
      } : undefined,
      onFilterChange: async (fieldName, nextChecked) => {
        if (!nextChecked) {
          if (QueryChangeManager) {
            QueryChangeManager.removeFilter(fieldName, {
              removeAll: true,
              source: 'SharedFieldPicker.removeQueryFilter'
            });
          }

          showToastMessage(`${fieldName} filters removed.`, 'success');
          return undefined;
        }

        return {
          close: true,
          afterClose: () => {
            openQueryFilterEditor(fieldName);
          }
        };
      },
      onRemoveDynamicField: async fieldName => {
        if (QueryChangeManager) {
          QueryChangeManager.removeDisplayedField(fieldName, {
            source: 'SharedFieldPicker.removeDynamicDisplayedField'
          });
          QueryChangeManager.removeFilter(fieldName, {
            removeAll: true,
            source: 'SharedFieldPicker.removeDynamicFieldFilters'
          });
        }

        const removed = removeDynamicField(fieldName);
        return {
          removed,
          successMessage: `${fieldName} removed from built fields.`
        };
      }
    });
  }

  function initQueryFieldPickerButton() {
    const addFieldBtn = document.getElementById('table-add-field-btn');
    if (!addFieldBtn || addFieldBtn.dataset.fieldPickerBound === 'true') {
      return;
    }

    addFieldBtn.dataset.fieldPickerBound = 'true';
    addFieldBtn.addEventListener('click', () => {
      openQueryFieldPicker().catch(error => {
        console.error('Failed to open query field picker:', error);
        showToastMessage('Failed to open the field picker.', 'error');
      });
    });
  }

  return {
    initQueryFieldPickerButton,
    openQueryFieldPicker,
    openQueryFilterEditor
  };
}

export {
  createQueryFieldPickerIntegration
};

/**
 * Query builder shell orchestration.
 * Handles startup metadata loading, overlay coordination, and initial builder bootstrapping.
 */
import {
  fieldDefsArray,
  hasLoadedFieldDefinitions,
  loadFieldDefinitions,
  updateFilteredDefs
} from '../core/fieldDefs.js';
import { QueryChangeManager } from '../core/queryState.js';
import { appServices } from '../core/appServices.js';
import { appUiActions, registerAppUiActionDependencies } from '../core/appUiActions.js';
import { DOM } from '../core/domCache.js';
import { StartupStatus } from './startupStatus.js';

let QueryBuilderShell;

(function registerQueryBuilderShell() {
  const dom = DOM;
  const services = appServices;
  const uiActions = appUiActions;
  let initialized = false;

  function handleQuerySearchInput() {
    const term = dom.queryInput?.value.trim().toLowerCase() || '';
    dom.clearSearchBtn?.classList.toggle('hidden', term === '');
    updateFilteredDefs(term);
  }

  function updateCategoryCounts() {
    // Retained as a stable facade target for modules that notify the builder
    // after field/filter changes. Form mode owns the active field picker UI.
  }

  function handleOverlayClick() {
    services.closeAllModals();
  }

  async function initializeBuilderState() {
    try {
      console.log('Initializing application for live queries (test data disabled)');
      QueryChangeManager.replaceDisplayedFields([], { source: 'Query.initialization' });
      await uiActions.showExampleTable([]);
      uiActions.updateRunButtonIcon();
    } catch (error) {
      console.error('Error initializing application:', error);
    }
  }

  async function loadDynamicFields() {
    let loadedFields = false;
    StartupStatus.update({
      title: 'Loading field metadata',
      detail: 'Pulling available fields from the backend and preparing the builder...'
    });

    try {
      await loadFieldDefinitions();
      loadedFields = hasLoadedFieldDefinitions();
      if (loadedFields) {
        StartupStatus.update({
          title: 'Fields ready',
          detail: `${fieldDefsArray.length.toLocaleString()} fields loaded. Opening the query builder...`
        });
      } else {
        StartupStatus.update({
          title: 'Opening builder',
          detail: 'Field metadata was unavailable, so the app is opening with limited field controls.'
        });
      }
    } catch (error) {
      console.error('Failed async initialization:', error);
      StartupStatus.update({
        title: 'Opening builder',
        detail: 'The backend field list could not be loaded. You can still review the app shell and retry later.'
      });
    } finally {
      StartupStatus.complete({ delay: loadedFields ? 180 : 700 });
    }
  }

  function initialize() {
    if (initialized) {
      return;
    }

    initialized = true;

    StartupStatus.initialize();
    dom.pageBody?.classList.add('night');
    dom.overlay?.addEventListener('click', handleOverlayClick);

    dom.queryInput?.addEventListener('input', handleQuerySearchInput);
    dom.clearSearchBtn?.addEventListener('click', () => {
      dom.queryInput.value = '';
      dom.queryInput.dispatchEvent(new Event('input', { bubbles: true }));
      dom.queryInput.focus();
    });

    initializeBuilderState();
    loadDynamicFields();
  }

  QueryBuilderShell = Object.freeze({
    initialize,
    updateCategoryCounts
  });
  registerAppUiActionDependencies({ queryBuilderShell: QueryBuilderShell });
})();

export { QueryBuilderShell };

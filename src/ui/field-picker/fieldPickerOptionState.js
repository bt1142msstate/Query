import {
  fieldDefs,
  getFieldAccessState,
  isFieldBuildable,
  isLocalDynamicField
} from '../../features/filters/fieldDefs.js';
import { getFieldPerformanceWarning } from '../../features/filters/fieldWarnings.js';

function normalizePickerState(state) {
  return {
    display: Boolean(state && state.display),
    filter: Boolean(state && state.filter)
  };
}

function isOptionDisplayable(option) {
  return !(option && option.displayable === false) && getOptionAccessState(option).authorized;
}

function isOptionBuildable(option) {
  if (!option) return false;
  if (option.buildable) return true;
  return typeof isFieldBuildable === 'function'
    ? isFieldBuildable(fieldDefs?.get(option.name) || option)
    : false;
}

function isOptionLocalDynamic(option) {
  return Boolean(option && (
    option.localDynamic
    || (typeof isLocalDynamicField === 'function' && isLocalDynamicField(option.name))
  ));
}

function getOptionAccessState(option) {
  if (option?.access && typeof option.access === 'object') {
    return option.access;
  }
  return getFieldAccessState(fieldDefs?.get(option?.name) || option);
}

function getOptionUnavailableMessage(option) {
  const access = getOptionAccessState(option);
  if (!access.authorized) {
    return access.message || 'Sign in with an authorized account to use this field.';
  }
  if (!isOptionDisplayable(option)) {
    return 'Create this field before displaying it';
  }
  return '';
}

function badge(label, modifier = '') {
  const className = modifier
    ? `form-mode-field-picker-badge form-mode-field-picker-badge--${modifier}`
    : 'form-mode-field-picker-badge';
  return `<span class="${className}">${label}</span>`;
}

function buildFieldPickerOptionBadges({
  allowDisplay,
  allowFilter,
  labels,
  option,
  state
}) {
  const normalizedState = normalizePickerState(state);
  const badges = [];
  if (allowDisplay && normalizedState.display) {
    badges.push(badge(labels.displayBadge));
  }
  if (allowFilter && normalizedState.filter) {
    badges.push(badge(labels.filterBadge));
  }
  if (allowDisplay && !isOptionDisplayable(option)) {
    const access = getOptionAccessState(option);
    badges.push(access.authorized ? badge('Build first', 'muted') : badge('Sign in', 'restricted'));
  }
  const access = getOptionAccessState(option);
  if (access.authorized && access.sensitive) {
    badges.push(badge('Sensitive', 'sensitive'));
  } else if (access.authorized && access.requiresAuth) {
    badges.push(badge('Protected', 'protected'));
  }
  if (isOptionLocalDynamic(option)) {
    badges.push(badge('Built', 'local'));
  }
  if (getFieldPerformanceWarning(option)) {
    badges.push(badge('May take longer', 'warning'));
  }
  return badges.join('');
}

function buildFieldPickerStatusText({
  allowDisplay,
  allowFilter,
  autoAddFilterFromPreview,
  displayChoice,
  filterChoice,
  labels,
  selected,
  state
}) {
  if (!selected) {
    return 'No field selected.';
  }

  const normalizedState = normalizePickerState(state);
  const statusParts = [];
  const appendStatus = message => {
    if (message && !statusParts.includes(message)) {
      statusParts.push(message);
    }
  };
  if (allowDisplay) {
    const unavailableMessage = getOptionUnavailableMessage(selected);
    if (unavailableMessage) {
      appendStatus(unavailableMessage);
    } else if (displayChoice) {
      if (displayChoice.checked && !normalizedState.display) {
        appendStatus(`Will ${labels.displayChoice.toLowerCase()}`);
      } else if (!displayChoice.checked && normalizedState.display) {
        appendStatus(`Will remove ${labels.displayChoice.toLowerCase()}`);
      } else if (normalizedState.display) {
        appendStatus(labels.displayBadge);
      }
    } else if (normalizedState.display) {
      appendStatus(labels.displayBadge);
    }
  }

  if (allowFilter && filterChoice) {
    const unavailableMessage = getOptionUnavailableMessage(selected);
    if (unavailableMessage && !getOptionAccessState(selected).authorized) {
      appendStatus(unavailableMessage);
    } else if (selected.filterable === false) {
      appendStatus('Backend filtering unavailable');
    } else if (filterChoice.checked && !normalizedState.filter) {
      appendStatus(`Will ${labels.filterChoice.toLowerCase()}`);
    } else if (!filterChoice.checked && normalizedState.filter) {
      appendStatus(`Will remove ${labels.filterChoice.toLowerCase()}`);
    } else if (normalizedState.filter) {
      appendStatus(labels.filterBadge);
    }
  } else if (allowFilter && autoAddFilterFromPreview && isOptionDisplayable(selected)) {
    if (selected.filterable === false) {
      appendStatus('Backend filtering unavailable');
    } else if (normalizedState.filter) {
      appendStatus(labels.filterBadge);
    } else {
      appendStatus('Enter a filter value to add it');
    }
  }

  return statusParts.length > 0
    ? statusParts.join(' • ')
    : 'No changes for this field.';
}

export {
  buildFieldPickerOptionBadges,
  buildFieldPickerStatusText,
  getFieldPerformanceWarning,
  getOptionAccessState,
  getOptionUnavailableMessage,
  isOptionBuildable,
  isOptionDisplayable,
  isOptionLocalDynamic,
  normalizePickerState
};

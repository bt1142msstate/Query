import { fieldDefs, isFieldBuildable, isLocalDynamicField } from '../../features/filters/fieldDefs.js';
import { getFieldPerformanceWarning } from '../../features/filters/fieldWarnings.js';

function normalizePickerState(state) {
  return {
    display: Boolean(state && state.display),
    filter: Boolean(state && state.filter)
  };
}

function isOptionDisplayable(option) {
  return !(option && option.displayable === false);
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
    badges.push(badge('Build first', 'muted'));
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
  if (allowDisplay) {
    if (!isOptionDisplayable(selected)) {
      statusParts.push('Create this field before displaying it');
    } else if (displayChoice) {
      if (displayChoice.checked && !normalizedState.display) {
        statusParts.push(`Will ${labels.displayChoice.toLowerCase()}`);
      } else if (!displayChoice.checked && normalizedState.display) {
        statusParts.push(`Will remove ${labels.displayChoice.toLowerCase()}`);
      } else if (normalizedState.display) {
        statusParts.push(labels.displayBadge);
      }
    } else if (normalizedState.display) {
      statusParts.push(labels.displayBadge);
    }
  }

  if (allowFilter && filterChoice) {
    if (selected.filterable === false) {
      statusParts.push('Backend filtering unavailable');
    } else if (filterChoice.checked && !normalizedState.filter) {
      statusParts.push(`Will ${labels.filterChoice.toLowerCase()}`);
    } else if (!filterChoice.checked && normalizedState.filter) {
      statusParts.push(`Will remove ${labels.filterChoice.toLowerCase()}`);
    } else if (normalizedState.filter) {
      statusParts.push(labels.filterBadge);
    }
  } else if (allowFilter && autoAddFilterFromPreview && isOptionDisplayable(selected)) {
    if (selected.filterable === false) {
      statusParts.push('Backend filtering unavailable');
    } else if (normalizedState.filter) {
      statusParts.push(labels.filterBadge);
    } else {
      statusParts.push('Enter a filter value to add it');
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
  isOptionBuildable,
  isOptionDisplayable,
  isOptionLocalDynamic,
  normalizePickerState
};

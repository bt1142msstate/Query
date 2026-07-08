import { formatFieldDefinitionTooltipHTML } from '../../core/formatting/tooltipFormatters.js';
import {
  fieldDefs,
  fieldDefsArray,
  getFieldAccessState,
  isFieldBackendFilterable,
  isFieldBuildable,
  isFieldDisplayable,
  isLocalDynamicField
} from '../../features/filters/fieldDefs.js';
import { getFieldPerformanceWarning } from '../../features/filters/fieldWarnings.js';

export function getFieldPickerOptionsFromDefinitions() {
  const source = Array.isArray(fieldDefsArray) && fieldDefsArray.length > 0
    ? fieldDefsArray
    : Array.from((fieldDefs && fieldDefs.values()) || []);

  return source
    .filter(fieldDef => fieldDef && fieldDef.name)
    .map(fieldDef => ({
      access: getFieldAccessState(fieldDef),
      name: String(fieldDef.name),
      type: String(fieldDef.type || 'text'),
      filterable: typeof isFieldBackendFilterable === 'function'
        ? isFieldBackendFilterable(fieldDef)
        : Array.isArray(fieldDef.filters) && fieldDef.filters.length > 0,
      displayable: typeof isFieldDisplayable === 'function'
        ? isFieldDisplayable(fieldDef)
        : true,
      buildable: typeof isFieldBuildable === 'function'
        ? isFieldBuildable(fieldDef)
        : Boolean(fieldDef.is_buildable || fieldDef.builder),
      localDynamic: typeof isLocalDynamicField === 'function'
        ? isLocalDynamicField(fieldDef)
        : false,
      desc: typeof fieldDef.desc === 'string' ? fieldDef.desc : '',
      description: typeof fieldDef.description === 'string' ? fieldDef.description : '',
      performanceWarning: getFieldPerformanceWarning(fieldDef),
      category: Array.isArray(fieldDef.category)
        ? fieldDef.category.filter(Boolean).join(', ')
        : String(fieldDef.category || ''),
      tooltipHtml: formatFieldDefinitionTooltipHTML(fieldDef, { title: fieldDef.name }) || ''
    }))
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }));
}

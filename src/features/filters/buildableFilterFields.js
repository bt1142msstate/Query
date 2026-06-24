function getBuilderInputs(fieldDef, builder) {
  return Array.isArray(builder?.inputs)
    ? builder.inputs
    : (Array.isArray(fieldDef?.builder_inputs) ? fieldDef.builder_inputs : []);
}

function getBuilderInputId(input) {
  return input?.id || input?.name || input?.key || '';
}

function isTruthyMetadataFlag(value) {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    return ['1', 'true', 'yes'].includes(value.trim().toLowerCase());
  }
  return false;
}

function isFalseyMetadataFlag(value) {
  if (value === false || value === 0) return true;
  if (typeof value === 'string') {
    return ['0', 'false', 'no'].includes(value.trim().toLowerCase());
  }
  return false;
}

export function isOptionalBuilderInput(input) {
  return Boolean(input && (isTruthyMetadataFlag(input.optional) || isFalseyMetadataFlag(input.required)));
}

function renderBuilderTemplate(template, inputValues, inputs = []) {
  const inputById = new Map(inputs.map(input => [getBuilderInputId(input), input]));

  return String(template || '').replace(/(.?)\{([^}]+)\}/g, (match, prefix, key) => {
    const value = String(inputValues?.[key] ?? '').trim();
    const input = inputById.get(key);

    if (!value && isOptionalBuilderInput(input)) {
      return '';
    }

    return `${prefix}${value}`;
  }).trim();
}

export function buildDynamicFieldDefinition(fieldDef, inputValues) {
  const builder = fieldDef && typeof fieldDef.builder === 'object' ? fieldDef.builder : null;
  const inputs = getBuilderInputs(fieldDef, builder);
  const fieldTemplate = builder?.outputFieldIdTemplate
    || builder?.fieldTemplate
    || fieldDef.field_template
    || fieldDef.name;
  const labelTemplate = builder?.displayLabelTemplate || fieldTemplate;

  const dynamicFieldName = renderBuilderTemplate(fieldTemplate, inputValues, inputs);
  const displayLabel = renderBuilderTemplate(labelTemplate, inputValues, inputs);

  return { dynamicFieldName, displayLabel };
}

export function collectBuilderInputValues(inputs, {
  showFilterError,
  useFirstCsvValue = false
}) {
  const inputValues = {};

  for (const input of inputs) {
    const value = String(input.value || '').trim();
    const valueToValidate = useFirstCsvValue ? value.split(',')[0].trim() : value;
    const patternStr = input.getAttribute('pattern');
    const errorMsg = input.dataset.errorMsg || 'Invalid input';
    const inputId = input.dataset.inputId;
    const isOptional = input.dataset.optional === 'true';

    if (!valueToValidate && isOptional) {
      inputValues[inputId] = value;
      continue;
    }

    if (!valueToValidate || (patternStr && !new RegExp(patternStr).test(valueToValidate))) {
      showFilterError(errorMsg, [input]);
      return { ok: false, values: {} };
    }

    inputValues[inputId] = value;
  }

  return { ok: true, values: inputValues };
}

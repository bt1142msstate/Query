import {
  assignInputSpecDefaultValues,
  buildGeneratedInputSpecsFromActiveFilters,
  clearInputSpecDefaultValue,
  getInputSignature,
  getInputSpecDefaultValues
} from './formModeQuerySpec.js';

function shouldRemoveUnmatchedInputFromQuerySync(inputSpec, specSource = 'generated') {
  if (!inputSpec) {
    return false;
  }

  if (inputSpec.source === 'query-filter') {
    return true;
  }

  return specSource === 'generated';
}

function getFieldDefinition(fieldDefs, fieldName) {
  return fieldDefs && typeof fieldDefs.get === 'function'
    ? fieldDefs.get(fieldName)
    : null;
}

function syncSpecInputsWithActiveFilters({
  spec,
  activeFilters,
  fieldDefs,
  specSource = 'generated'
} = {}) {
  if (!spec || !Array.isArray(spec.inputs)) {
    return {
      changed: false,
      controlsToSync: []
    };
  }

  let changed = false;
  const existingInputs = spec.inputs.slice();
  const generatedInputs = buildGeneratedInputSpecsFromActiveFilters(existingInputs, activeFilters, {
    fieldDefs
  });
  const existingBySignature = new Map();
  const controlsToSync = [];

  existingInputs.forEach(inputSpec => {
    const signature = getInputSignature(inputSpec);
    if (!existingBySignature.has(signature)) {
      existingBySignature.set(signature, []);
    }
    existingBySignature.get(signature).push(inputSpec);
  });

  const usedInputs = new Set();
  const nextInputs = [];

  generatedInputs.forEach(generatedInput => {
    const signature = getInputSignature(generatedInput);
    const candidates = existingBySignature.get(signature) || [];
    const match = candidates.find(candidate => !usedInputs.has(candidate));

    if (!match) {
      nextInputs.push(generatedInput);
      changed = true;
      return;
    }

    const fieldDef = getFieldDefinition(fieldDefs, match.field);
    const previousOperator = match.operator;
    const previousType = match.type;
    const previousDefaults = JSON.stringify(getInputSpecDefaultValues(match));
    const nextDefaults = getInputSpecDefaultValues(generatedInput);
    const nextMultiple = Boolean(generatedInput.multiple);

    match.operator = generatedInput.operator;
    match.type = generatedInput.type || match.type;
    assignInputSpecDefaultValues(match, nextDefaults, fieldDef);
    if (match.multiple !== nextMultiple) {
      match.multiple = nextMultiple;
    }

    const defaultsChanged = previousDefaults !== JSON.stringify(getInputSpecDefaultValues(match));
    const operatorChanged = previousOperator !== match.operator;
    const typeChanged = previousType !== match.type;

    if (defaultsChanged || operatorChanged || typeChanged) {
      changed = true;
      controlsToSync.push({
        inputSpec: match,
        previousOperator
      });
    }

    usedInputs.add(match);
    nextInputs.push(match);
  });

  existingInputs.forEach(inputSpec => {
    if (usedInputs.has(inputSpec)) {
      return;
    }

    if (shouldRemoveUnmatchedInputFromQuerySync(inputSpec, specSource)) {
      changed = true;
      return;
    }

    const previousDefaults = JSON.stringify(getInputSpecDefaultValues(inputSpec));
    clearInputSpecDefaultValue(inputSpec);
    if (previousDefaults !== JSON.stringify(getInputSpecDefaultValues(inputSpec))) {
      changed = true;
    }
    nextInputs.push(inputSpec);
  });

  if (
    spec.inputs.length !== nextInputs.length
    || spec.inputs.some((inputSpec, index) => inputSpec !== nextInputs[index])
  ) {
    spec.inputs = nextInputs;
    changed = true;
  }

  return {
    changed,
    controlsToSync
  };
}

export {
  shouldRemoveUnmatchedInputFromQuerySync,
  syncSpecInputsWithActiveFilters
};

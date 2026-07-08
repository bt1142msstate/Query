const DENIED_ACCESS_VALUES = new Set([
  'denied',
  'forbidden',
  'not_authorized',
  'restricted_denied',
  'unauthenticated',
  'unauthorized'
]);

const RESTRICTED_ACCESS_VALUES = new Set([
  'private',
  'protected',
  'restricted',
  'sensitive'
]);

function normalizeBoolean(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  return null;
}

function normalizeStringList(value) {
  if (Array.isArray(value)) {
    return value.map(item => String(item || '').trim()).filter(Boolean);
  }
  if (value === undefined || value === null || value === '') {
    return [];
  }
  return String(value)
    .split(/[\n,]+/u)
    .map(item => item.trim())
    .filter(Boolean);
}

function getAccessObject(fieldDef) {
  return fieldDef?.access && typeof fieldDef.access === 'object' && !Array.isArray(fieldDef.access)
    ? fieldDef.access
    : {};
}

function getAccessText(fieldDef) {
  if (typeof fieldDef?.access === 'string') return fieldDef.access.trim().toLowerCase();
  return String(fieldDef?.accessLevel || fieldDef?.access_level || '').trim().toLowerCase();
}

function getFirstBoolean(...values) {
  for (const value of values) {
    const normalized = normalizeBoolean(value);
    if (normalized !== null) return normalized;
  }
  return null;
}

function getFieldAccessState(fieldDef) {
  if (!fieldDef || typeof fieldDef !== 'object') {
    return {
      authorized: true,
      message: '',
      requiredScopes: [],
      requiresAuth: false,
      sensitive: false
    };
  }

  const access = getAccessObject(fieldDef);
  const accessText = getAccessText(fieldDef);
  const requiredScopes = normalizeStringList(
    fieldDef.requiredScopes
    ?? fieldDef.required_scopes
    ?? fieldDef.scopes
    ?? access.requiredScopes
    ?? access.required_scopes
    ?? access.scopes
  );
  const sensitive = getFirstBoolean(
    fieldDef.sensitive,
    fieldDef.isSensitive,
    fieldDef.is_sensitive,
    access.sensitive,
    access.isSensitive,
    access.is_sensitive
  ) ?? RESTRICTED_ACCESS_VALUES.has(accessText);
  const requiresAuth = getFirstBoolean(
    fieldDef.requiresAuth,
    fieldDef.authRequired,
    fieldDef.requires_auth,
    fieldDef.auth_required,
    access.requiresAuth,
    access.authRequired,
    access.requires_auth,
    access.auth_required
  ) ?? Boolean(requiredScopes.length || sensitive);
  const explicitlyAuthorized = getFirstBoolean(
    fieldDef.authorized,
    fieldDef.isAuthorized,
    fieldDef.is_authorized,
    fieldDef.accessGranted,
    fieldDef.access_granted,
    fieldDef.canAccess,
    fieldDef.can_access,
    fieldDef.canUse,
    fieldDef.can_use,
    access.authorized,
    access.isAuthorized,
    access.is_authorized,
    access.accessGranted,
    access.access_granted,
    access.canAccess,
    access.can_access,
    access.canUse,
    access.can_use
  );
  const explicitlyAvailable = getFirstBoolean(
    fieldDef.available,
    fieldDef.enabled,
    access.available,
    access.enabled
  );
  const disabled = getFirstBoolean(fieldDef.disabled, access.disabled) === true;
  const deniedByText = DENIED_ACCESS_VALUES.has(accessText) || DENIED_ACCESS_VALUES.has(String(access.status || '').trim().toLowerCase());
  const authorized = explicitlyAuthorized === false || explicitlyAvailable === false || disabled || deniedByText
    ? false
    : true;
  const message = String(
    fieldDef.authMessage
    ?? fieldDef.accessMessage
    ?? fieldDef.authorizationMessage
    ?? fieldDef.auth_message
    ?? fieldDef.access_message
    ?? fieldDef.authorization_message
    ?? access.message
    ?? access.authMessage
    ?? access.accessMessage
    ?? ''
  ).trim();

  return {
    authorized,
    message,
    requiredScopes,
    requiresAuth,
    sensitive
  };
}

function isFieldAccessAuthorized(fieldDef) {
  return getFieldAccessState(fieldDef).authorized;
}

function isFieldAuthRequired(fieldDef) {
  return getFieldAccessState(fieldDef).requiresAuth;
}

function isFieldSensitive(fieldDef) {
  return getFieldAccessState(fieldDef).sensitive;
}

export {
  getFieldAccessState,
  isFieldAccessAuthorized,
  isFieldAuthRequired,
  isFieldSensitive,
  normalizeStringList
};

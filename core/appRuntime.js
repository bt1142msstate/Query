/**
 * Private runtime registry for legacy cross-module coordination.
 *
 * This replaces the old browser-global window bridge. New modules should prefer
 * direct imports or explicit dependency injection; this registry exists only for
 * the remaining cyclic browser-script seams while they are being split.
 */
const appRuntime = {};

export { appRuntime };

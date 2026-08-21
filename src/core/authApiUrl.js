import { isDemoApiUrl } from './mockQueryBackend.js';

const DEFAULT_ACCOUNT_API_URL = 'https://mlp.sirsi.net/uhtbin/account_api.pl';

function resolveAccountApiUrl(queryApiUrl, accountApiUrl = DEFAULT_ACCOUNT_API_URL) {
  return isDemoApiUrl(queryApiUrl) ? queryApiUrl : accountApiUrl;
}

export { DEFAULT_ACCOUNT_API_URL, resolveAccountApiUrl };

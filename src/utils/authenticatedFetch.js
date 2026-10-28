const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function createAuthenticatedFetch(fetchImplementation, {
  baseUrl,
  onUnauthorized = () => {},
  onForbidden = () => {}
}) {
  return async function authenticatedFetch(input, init = {}) {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, baseUrl);
    const base = new URL(baseUrl);
    const isApi = url.origin === base.origin && (url.pathname === '/api' || url.pathname.startsWith('/api/'));
    if (!isApi) return fetchImplementation(input, init);

    const method = (init.method || (typeof input === 'object' && input.method) || 'GET').toUpperCase();
    const headers = new Headers(init.headers || (typeof input === 'object' && input.headers) || {});
    if (!SAFE_METHODS.has(method)) headers.set('X-WannaV-Request', '1');
    const response = await fetchImplementation(input, { ...init, headers, credentials: 'same-origin' });
    if (response.status === 401 || response.status === 403) {
      const details = await response.clone().json().catch(() => ({}));
      if (response.status === 401) onUnauthorized(details);
      else onForbidden(details);
    }
    return response;
  };
}

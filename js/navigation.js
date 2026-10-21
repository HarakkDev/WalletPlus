export function routeHref(page, params = {}) {
  if (!/^[a-z][a-z-]*$/.test(page)) throw new Error('Página inválida.');
  const query = new URLSearchParams();
  Object.entries(params).forEach(([name, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(name, String(value));
  });
  const search = query.toString();
  return `#${page}${search ? `?${search}` : ''}`;
}

export function consumeRouteParams() {
  const separator = location.hash.indexOf('?');
  const params = new URLSearchParams(separator < 0 ? '' : location.hash.slice(separator + 1));
  if (separator >= 0) history.replaceState(history.state, '', location.hash.slice(0, separator));
  return params;
}

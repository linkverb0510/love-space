export function getServiceWorkerUrl(basePath: string, origin: string): string {
  const normalizedBasePath = basePath.endsWith('/') ? basePath : `${basePath}/`;
  return new URL(`${normalizedBasePath}sw.js`, origin).toString();
}

export function isPrivateSpaceEntry(search = typeof window === 'undefined' ? '' : window.location.search): boolean {
  return new URLSearchParams(search).get('space') === 'private';
}

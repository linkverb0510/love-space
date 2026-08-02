export function getServiceWorkerUrl(basePath: string, origin: string): string {
  const normalizedBasePath = basePath.endsWith('/') ? basePath : `${basePath}/`;
  return new URL(`${normalizedBasePath}sw.js`, origin).toString();
}

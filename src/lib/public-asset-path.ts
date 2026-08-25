function normalizeBaseUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, '');

  if (!normalized) return '/';
  if (normalized.startsWith('/')) return `${normalized}/`;
  return `/${normalized}/`;
}

export function getPublicAssetPath(assetPath: string, baseUrl = import.meta.env.BASE_URL): string {
  const normalizedAssetPath = assetPath.replace(/^\/+/, '');
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

  if (normalizedBaseUrl === '/') return `/${normalizedAssetPath}`;
  return `${normalizedBaseUrl}${normalizedAssetPath}`;
}

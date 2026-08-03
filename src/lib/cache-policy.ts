const SUPABASE_PATHS = ['/rest/v1/', '/auth/v1/', '/storage/v1/'];

export function shouldCacheRequest(requestUrl: string, appOrigin: string, destination: string): boolean {
  const url = new URL(requestUrl, appOrigin);
  const origin = new URL(appOrigin).origin;
  return url.origin === origin && destination !== 'image' && !SUPABASE_PATHS.some((path) => url.pathname.includes(path));
}

export async function hashAccessPassword(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function verifyAccessPassword(password: string, expectedHash: string): Promise<boolean> {
  if (!expectedHash.trim()) return false;
  return (await hashAccessPassword(password)) === expectedHash.trim().toLowerCase();
}

import type { AssignedRole, SpaceRole } from '../types';

export type ActiveRole = Extract<SpaceRole, 'l' | 'w'>;

const ACTIVE_ROLE_STORAGE_PREFIX = 'love-space-active-role:';

export function normalizeRole(value: unknown): SpaceRole {
  if (value === 'l' || value === 'L' || value === '我') return 'l';
  if (value === 'w' || value === 'W' || value === '你') return 'w';
  if (value === 'both' || value === '一起') return 'both';
  return 'unknown';
}

export function normalizeAssignee(value: unknown): AssignedRole {
  const role = normalizeRole(value);
  return role === 'l' || role === 'w' ? role : 'both';
}

export function getRoleLabel(role: SpaceRole): string {
  if (role === 'l') return 'L';
  if (role === 'w') return 'W';
  if (role === 'both') return '一起';
  return '未标记';
}

function activeRoleStorageKey(spacePath: string): string {
  return `${ACTIVE_ROLE_STORAGE_PREFIX}${encodeURIComponent(spacePath || 'default')}`;
}

export function getActiveRole(spacePath: string): ActiveRole {
  if (typeof window === 'undefined') return 'l';
  return normalizeRole(window.localStorage.getItem(activeRoleStorageKey(spacePath))) === 'w' ? 'w' : 'l';
}

export function saveActiveRole(spacePath: string, role: ActiveRole): void {
  if (typeof window !== 'undefined') window.localStorage.setItem(activeRoleStorageKey(spacePath), role);
}

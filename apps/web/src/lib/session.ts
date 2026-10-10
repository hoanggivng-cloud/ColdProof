export const TOKEN_COOKIE = 'cp_token';
export const USER_COOKIE = 'cp_user';
export type Role = 'OPERATOR' | 'QA_REVIEWER' | 'ADMIN';
export interface SessionUser { email: string; role: Role; serverRole: string }

export function toRole(value: string): Role | null {
  if (value === 'ADMIN' || value === 'QA_REVIEWER' || value === 'OPERATOR') return value;
  return null;
}
export const roleLabels: Record<Role, string> = { OPERATOR: 'Operator', QA_REVIEWER: 'QA Reviewer', ADMIN: 'Admin' };
export const demoAccounts: { role: Role; email: string }[] = [
  { role: 'OPERATOR', email: 'operator@coldproof.local' },
  { role: 'QA_REVIEWER', email: 'qa@coldproof.local' },
  { role: 'ADMIN', email: 'admin@coldproof.local' },
];
export const isDemo = () => process.env.NEXT_PUBLIC_APP_ENV === 'demo' || process.env.NODE_ENV !== 'production';

import type { LedgerMember } from './types';

export function memberDisplayName(members: LedgerMember[], userId?: string | null): string | undefined {
  if (!userId) return undefined;
  return members.find(member => member.userId === userId)?.displayName ?? userId;
}

export function appendMemberLabel(label: string, members: LedgerMember[], userId?: string | null): string {
  const owner = memberDisplayName(members, userId);
  return owner ? `${label} · ${owner}` : label;
}

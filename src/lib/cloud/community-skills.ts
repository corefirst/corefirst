/**
 * Community skills (prompt templates) — cloud-backed CRUD + social actions.
 * Mirrors `corefirst-world` /v1/skills.
 */
import { cloudJson } from './client';
import type { CloudUser } from './storage';

export interface CommunitySkill {
  id: string;
  featureSlot: string;
  name: string;
  description?: string | null;
  content: string;
  vars: any;
  isSystem: boolean;
  authorId: string;
  author?: Pick<CloudUser, 'id' | 'name' | 'avatarUrl'>;
  visibility: 'PUBLIC_FREE' | 'PUBLIC_PAID' | 'PRIVATE';
  forkOf?: string | null;
  likes: number;
  forks: number;
  createdAt: string;
  updatedAt: string;
}

export async function listCommunitySkillsRemote(): Promise<CommunitySkill[]> {
  return cloudJson<CommunitySkill[]>('/v1/skills');
}

export async function resolveCommunitySkill(
  featureSlot: string,
  userId?: string,
): Promise<CommunitySkill> {
  const q = userId ? `?userId=${encodeURIComponent(userId)}` : '';
  return cloudJson<CommunitySkill>(`/v1/skills/resolve/${encodeURIComponent(featureSlot)}${q}`);
}

export async function publishCommunitySkill(args: {
  featureSlot: string;
  name: string;
  description?: string;
  content: string;
  vars?: any;
  visibility?: 'PUBLIC_FREE' | 'PRIVATE';
}): Promise<CommunitySkill> {
  return cloudJson<CommunitySkill>('/v1/skills', {
    method: 'POST',
    body: { ...args, visibility: args.visibility ?? 'PUBLIC_FREE' },
  });
}

export async function forkCommunitySkill(id: string): Promise<CommunitySkill> {
  return cloudJson<CommunitySkill>(`/v1/skills/${id}/fork`, { method: 'POST', body: {} });
}

export async function likeCommunitySkill(id: string): Promise<{ liked: boolean }> {
  return cloudJson(`/v1/skills/${id}/like`, { method: 'POST' });
}

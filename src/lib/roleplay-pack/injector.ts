import type { RoleplayPack } from '@/src/types/roleplay-pack';

export interface InjectionResult {
  packSection: string;
  derivedContext: string;
}

export function renderForRoleplay(pack: RoleplayPack): InjectionResult {
  return {
    packSection: pack.prompt,
    derivedContext: `${pack.name} — ${pack.domain}`,
  };
}

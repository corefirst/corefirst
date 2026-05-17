'use client';
import { useState, useEffect, useCallback } from 'react';
import { Loader2, Heart, GitFork, RefreshCw, Send, Share2 } from 'lucide-react';
import { useSaasAuth } from '@/hooks/useSaasAuth';
import * as Comm from '@/src/lib/saas/community-skills';

interface OwnSkillLite {
  _id?: string;
  featureSlot?: string;
  name?: string;
  description?: string;
  content?: string;
  vars?: any;
}

interface Props {
  /** Optional list of the user's local skills, to enable one-click publish. */
  mySkills?: OwnSkillLite[];
  /** Called after a successful fork — caller can refresh local skill list. */
  onForked?: (skill: Comm.CommunitySkill) => void;
}

export function CommunitySkillsPanel({ mySkills = [], onForked }: Props) {
  const { loggedIn } = useSaasAuth();
  const [list, setList] = useState<Comm.CommunitySkill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [liked, setLiked] = useState<Record<string, boolean>>({});

  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try {
      setList(await Comm.listCommunitySkillsRemote());
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (loggedIn) reload(); }, [loggedIn, reload]);

  async function handleFork(s: Comm.CommunitySkill) {
    setBusy(b => ({ ...b, [s.id]: true }));
    try {
      const forked = await Comm.forkCommunitySkill(s.id);
      onForked?.(forked);
      // Refresh list so the increment counter is visible
      reload();
    } catch (e: any) {
      setError(e?.message || 'Fork 失败');
    } finally {
      setBusy(b => ({ ...b, [s.id]: false }));
    }
  }

  async function handleLike(s: Comm.CommunitySkill) {
    const before = liked[s.id] ?? false;
    setLiked(l => ({ ...l, [s.id]: !before }));
    try {
      const { liked: now } = await Comm.likeCommunitySkill(s.id);
      setLiked(l => ({ ...l, [s.id]: now }));
    } catch {
      setLiked(l => ({ ...l, [s.id]: before }));
    }
  }

  async function handlePublish(skill: OwnSkillLite) {
    if (!skill.featureSlot || !skill.name || !skill.content) return;
    setBusy(b => ({ ...b, [skill._id || skill.name!]: true }));
    try {
      await Comm.publishCommunitySkill({
        featureSlot: skill.featureSlot,
        name: skill.name,
        description: skill.description,
        content: skill.content,
        vars: skill.vars,
        visibility: 'PUBLIC_FREE',
      });
      reload();
    } catch (e: any) {
      setError(e?.message || '发布失败');
    } finally {
      setBusy(b => ({ ...b, [skill._id || skill.name!]: false }));
    }
  }

  if (!loggedIn) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        登录 SaaS 后可以浏览社区共享的 prompt 模板、Fork 到本地、为喜欢的模板点赞。
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
          <Share2 size={14} className="text-blue-600" /> 社区 Skills
        </h4>
        <button
          onClick={reload}
          className="text-xs text-gray-500 hover:text-blue-600 flex items-center gap-1"
        >
          <RefreshCw size={12} /> 刷新
        </button>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {mySkills.length > 0 && (
        <details className="rounded-xl border border-gray-200 bg-gray-50 p-2">
          <summary className="text-xs font-medium text-gray-600 cursor-pointer">
            一键发布我的本地 skills（公开）
          </summary>
          <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
            {mySkills.map(s => (
              <div key={s._id || s.name} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate">{s.name} <span className="text-gray-400">({s.featureSlot})</span></span>
                <button
                  onClick={() => handlePublish(s)}
                  disabled={busy[s._id || s.name || '']}
                  className="px-2 py-0.5 bg-blue-600 text-white rounded-md text-[11px] hover:bg-blue-700 disabled:opacity-50"
                >
                  <Send size={10} className="inline" /> 发布
                </button>
              </div>
            ))}
          </div>
        </details>
      )}

      {loading ? (
        <div className="text-xs text-gray-400 flex items-center gap-1">
          <Loader2 size={12} className="animate-spin" /> 加载中…
        </div>
      ) : list.length === 0 ? (
        <p className="text-xs text-gray-400">还没有社区 skills。</p>
      ) : (
        <ul className="space-y-2">
          {list.map(s => (
            <li key={s.id} className="rounded-xl border border-gray-200 bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm text-gray-900 truncate">{s.name}</p>
                  <p className="text-[11px] text-gray-500 truncate">
                    {s.featureSlot} · by {s.author?.name || '匿名'}
                  </p>
                  {s.description && (
                    <p className="text-xs text-gray-600 mt-1 line-clamp-2">{s.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleLike(s)}
                    className={`text-xs flex items-center gap-0.5 ${liked[s.id] ? 'text-red-500' : 'text-gray-400 hover:text-red-500'}`}
                  >
                    <Heart size={12} fill={liked[s.id] ? 'currentColor' : 'none'} />
                    {s.likes}
                  </button>
                  <button
                    onClick={() => handleFork(s)}
                    disabled={busy[s.id]}
                    className="text-xs flex items-center gap-0.5 text-gray-400 hover:text-blue-600 disabled:opacity-50"
                    title="Fork 到我的 skills"
                  >
                    <GitFork size={12} />
                    {s.forks}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

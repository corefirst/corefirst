'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  Loader2, Download, Heart, MessageCircle, ShoppingCart, RefreshCw,
  AlertCircle, CheckCircle, BookOpen, X,
} from 'lucide-react';
import { useSaasAuth } from '@/hooks/useSaasAuth';
import * as Market from '@/src/lib/saas/market';
import { SaasError } from '@/src/lib/saas/client';

type Status = 'idle' | 'loading' | 'downloading' | 'imported' | 'error';

interface BookState {
  status: Status;
  message?: string;
  liked?: boolean;
}

export function MarketPanel() {
  const { loggedIn, user, refresh } = useSaasAuth();
  const [books, setBooks] = useState<Market.MarketTextbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [state, setState] = useState<Record<string, BookState>>({});
  const [activeComments, setActiveComments] = useState<string | null>(null);
  const [comments, setComments] = useState<Market.MarketComment[]>([]);
  const [newComment, setNewComment] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setBooks(await Market.listTextbooks());
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const updateState = (id: string, patch: Partial<BookState>) =>
    setState(s => ({ ...s, [id]: { ...(s[id] || { status: 'idle' }), ...patch } }));

  async function handleDownload(b: Market.MarketTextbook) {
    if (!loggedIn) { setError('请先在「设置 → 会员」中登录 SaaS'); return; }
    updateState(b.id, { status: 'downloading', message: '获取下载链接...' });
    try {
      // Ensure purchase first (no-op if already purchased / free / owner)
      try { await Market.purchaseTextbook(b.id); } catch (e: any) {
        if (e instanceof SaasError && e.code === 'INSUFFICIENT_CREDITS') {
          updateState(b.id, { status: 'error', message: '积分不足，购买失败' });
          return;
        }
        // 402 PURCHASE_REQUIRED would land here too, but purchase endpoint handles free path itself
        if (!(e instanceof SaasError) || (e.status !== 200 && e.status !== 201)) {
          // ignore — getDownloadUrl will surface a clearer error
        }
      }

      updateState(b.id, { message: '正在下载课程...' });
      const blob = await Market.downloadTextbookBlob(b.id);

      updateState(b.id, { message: '导入到本地...' });
      const res = await fetch('/api/market/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/zip' },
        body: blob,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || '导入失败');
      }

      updateState(b.id, { status: 'imported', message: '已加入本地课程' });
      refresh().catch(() => {});
    } catch (e: any) {
      updateState(b.id, { status: 'error', message: e?.message || '下载失败' });
    }
  }

  async function handleLike(b: Market.MarketTextbook) {
    if (!loggedIn) return;
    const before = state[b.id]?.liked ?? false;
    updateState(b.id, { liked: !before });
    try {
      const { liked } = await Market.toggleLike(b.id);
      updateState(b.id, { liked });
    } catch {
      updateState(b.id, { liked: before });
    }
  }

  async function openComments(id: string) {
    setActiveComments(id);
    setComments([]);
    try {
      setComments(await Market.listComments(id));
    } catch (e: any) {
      setError(e?.message || '加载评论失败');
    }
  }

  async function submitComment() {
    if (!activeComments || !newComment.trim() || !loggedIn) return;
    try {
      const c = await Market.postComment(activeComments, newComment.trim());
      setComments(cs => [...cs, c]);
      setNewComment('');
    } catch (e: any) {
      setError(e?.message || '发表失败');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <BookOpen size={18} className="text-blue-600" /> 课程市场
        </h3>
        <button
          onClick={reload}
          className="text-xs text-gray-500 hover:text-blue-600 flex items-center gap-1"
        >
          <RefreshCw size={12} /> 刷新
        </button>
      </div>

      {!loggedIn && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
          浏览免费可见，但要下载课程和参与社区，请先在「设置 → 会员」中登录。
        </p>
      )}

      {error && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <AlertCircle size={12} /> {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <Loader2 size={14} className="animate-spin" /> 加载中…
        </div>
      ) : books.length === 0 ? (
        <p className="text-sm text-gray-400">暂时还没有课程上架。</p>
      ) : (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
          {books.map(b => {
            const s = state[b.id] || { status: 'idle' as Status };
            const price = Number(b.price);
            return (
              <div key={b.id} className="rounded-2xl border border-gray-200 bg-white p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="font-medium text-gray-900 truncate">{b.title}</h4>
                  <span className={`text-xs font-semibold ${price === 0 ? 'text-green-600' : 'text-amber-600'}`}>
                    {price === 0 ? '免费' : `${price} credits`}
                  </span>
                </div>
                {b.description && (
                  <p className="text-xs text-gray-600 line-clamp-2">{b.description}</p>
                )}
                <p className="text-[11px] text-gray-400">
                  {b.language} · by {b.owner?.name || '匿名'} · ↓ {b.downloadCount}
                </p>

                {s.message && (
                  <p className={`text-xs flex items-center gap-1 ${
                    s.status === 'error' ? 'text-red-600' :
                    s.status === 'imported' ? 'text-green-600' :
                    'text-blue-600'
                  }`}>
                    {s.status === 'imported' && <CheckCircle size={12} />}
                    {s.status === 'error' && <AlertCircle size={12} />}
                    {(s.status === 'downloading' || s.status === 'loading') && <Loader2 size={12} className="animate-spin" />}
                    {s.message}
                  </p>
                )}

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleLike(b)}
                      disabled={!loggedIn}
                      className={`text-xs flex items-center gap-1 ${s.liked ? 'text-red-500' : 'text-gray-400 hover:text-red-500'} disabled:opacity-40`}
                    >
                      <Heart size={13} fill={s.liked ? 'currentColor' : 'none'} />
                      {b._count?.likes ?? 0}
                    </button>
                    <button
                      onClick={() => openComments(b.id)}
                      className="text-xs text-gray-400 hover:text-blue-600 flex items-center gap-1"
                    >
                      <MessageCircle size={13} />
                      {b._count?.comments ?? 0}
                    </button>
                  </div>
                  <button
                    onClick={() => handleDownload(b)}
                    disabled={!loggedIn || s.status === 'downloading'}
                    className="flex items-center gap-1 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    {price > 0 ? <ShoppingCart size={13} /> : <Download size={13} />}
                    {price > 0 ? '购买并下载' : '下载'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeComments && (
        <CommentsDrawer
          comments={comments}
          loggedIn={loggedIn}
          newComment={newComment}
          setNewComment={setNewComment}
          onSubmit={submitComment}
          onClose={() => setActiveComments(null)}
        />
      )}
    </div>
  );
}

function CommentsDrawer(props: {
  comments: Market.MarketComment[];
  loggedIn: boolean;
  newComment: string;
  setNewComment: (v: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h4 className="font-semibold text-gray-900">评论</h4>
          <button onClick={props.onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {props.comments.length === 0 ? (
            <p className="text-sm text-gray-400">还没有评论。</p>
          ) : props.comments.map(c => (
            <div key={c.id} className="text-sm">
              <p className="font-medium text-gray-700">{c.user?.name || '匿名'}</p>
              <p className="text-gray-600 whitespace-pre-wrap break-words">{c.content}</p>
              <p className="text-[10px] text-gray-400">{new Date(c.createdAt).toLocaleString()}</p>
            </div>
          ))}
        </div>
        {props.loggedIn ? (
          <div className="px-4 py-3 border-t border-gray-100 flex gap-2">
            <input
              value={props.newComment}
              onChange={e => props.setNewComment(e.target.value)}
              placeholder="说点什么..."
              className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm"
              onKeyDown={e => { if (e.key === 'Enter') props.onSubmit(); }}
            />
            <button
              onClick={props.onSubmit}
              className="bg-blue-600 text-white px-3 py-2 rounded-xl text-sm font-medium hover:bg-blue-700"
            >
              发送
            </button>
          </div>
        ) : (
          <p className="px-4 py-3 border-t border-gray-100 text-xs text-gray-500">
            登录会员后即可发表评论。
          </p>
        )}
      </div>
    </div>
  );
}

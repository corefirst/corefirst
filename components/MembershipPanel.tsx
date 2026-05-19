'use client';
import { useState, useEffect, useCallback } from 'react';
import { Loader2, LogOut, UserCircle2, CreditCard, Mail, History, ChevronLeft } from 'lucide-react';
import { useCloudAuth } from '@/hooks/useCloudAuth';
import { cloudForgotPassword } from '@/src/lib/cloud/auth';
import { getCloudBaseUrl, CloudError } from '@/src/lib/cloud/client';
import { listTransactions, type CloudTransaction } from '@/src/lib/cloud/transactions';
import { fetchBalance, listPackages, startCheckout, type CreditBalanceSummary, type CreditPackage } from '@/src/lib/cloud/credits';
import { beginOAuthLogin, beginLinkExternalAccount, listMyIdentities, unlinkIdentity, type BoundIdentity } from '@/src/lib/cloud/identities';

type Mode = 'login' | 'register';

export function MembershipPanel() {
  const { session, user, loggedIn, login, register, logout, refresh } = useCloudAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (loggedIn) refresh().catch(() => {});
  }, [loggedIn, refresh]);

  if (loggedIn && user && showHistory) {
    return <TransactionHistory onBack={() => setShowHistory(false)} />;
  }

  if (loggedIn && user) {
    return (
      <LoggedInView
        user={user}
        onLogout={logout}
        onRefresh={refresh}
        onShowHistory={() => setShowHistory(true)}
      />
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') await login(email.trim(), password);
      else await register(email.trim(), password, name.trim() || undefined);
    } catch (err: any) {
      setError(err?.message || 'Authentication failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleForgot() {
    if (!email.trim()) { setError('请先填写邮箱'); return; }
    setError(''); setBusy(true);
    try {
      await cloudForgotPassword(email.trim());
      setForgotSent(true);
    } catch (err: any) {
      setError(err?.message || 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 text-sm">
        {(['login', 'register'] as const).map(m => (
          <button
            key={m}
            type="button"
            onClick={() => { setMode(m); setError(''); }}
            className={`flex-1 py-2 rounded-xl font-medium transition-colors ${
              mode === m ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {m === 'login' ? '登录' : '注册'}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {mode === 'register' && (
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">昵称（可选）</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Alice"
            />
          </div>
        )}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">邮箱</label>
          <input
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">密码</label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="••••••"
          />
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}
        {forgotSent && <p className="text-xs text-green-600">如果该邮箱已注册，重置链接已发送。</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-2 rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          {mode === 'login' ? '登录' : '注册并登录'}
        </button>

        {mode === 'login' && (
          <button
            type="button"
            onClick={handleForgot}
            disabled={busy}
            className="w-full text-xs text-gray-500 hover:text-blue-600"
          >
            忘记密码？
          </button>
        )}
      </form>

      <div className="relative flex items-center my-2">
        <div className="flex-1 border-t border-gray-200" />
        <span className="px-2 text-[10px] text-gray-400 uppercase">or</span>
        <div className="flex-1 border-t border-gray-200" />
      </div>

      <div className="space-y-2">
        <button
          type="button"
          onClick={() => beginOAuthLogin('google')}
          className="w-full flex items-center justify-center gap-2 bg-white border border-gray-300 py-2 rounded-xl text-sm hover:bg-gray-50"
        >
          <GoogleGlyph /> 用 Google 登录
        </button>
        <button
          type="button"
          onClick={() => beginOAuthLogin('github')}
          className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white py-2 rounded-xl text-sm hover:bg-black"
        >
          <GitHubGlyph /> 用 GitHub 登录
        </button>
      </div>

      <p className="text-[11px] text-gray-400 text-center leading-relaxed">
        服务地址 <code className="text-gray-500">{getCloudBaseUrl()}</code><br />
        登录 CoreFirst 云后可使用云端 AI、下载课程、与社区互动。
      </p>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.6 4 24 4 16 4 9.1 8.6 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.5 0 10.4-2.1 14.1-5.6l-6.5-5.5C29.5 34.6 26.9 36 24 36c-5.3 0-9.7-3.4-11.3-8l-6.6 5.1C9 39.4 16 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.7l6.5 5.5C42 35.9 44 30.4 44 24c0-1.3-.1-2.4-.4-3.5z"/>
    </svg>
  );
}
function GitHubGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.3.8-.6v-2.1c-3.2.7-3.9-1.4-3.9-1.4-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.8-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.4-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2 1-.3 2-.4 3-.4s2 .1 3 .4c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.8.1 3.1.7.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z"/>
    </svg>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// Logged-in view: identity card + bucketed balance + transaction shortcut +
// purchasable packages (Stripe stub for now)
// ───────────────────────────────────────────────────────────────────────────────

function LoggedInView(props: {
  user: { id: string; email: string; name?: string | null; tier?: string; credits?: number };
  onLogout: () => void;
  onRefresh: () => Promise<any>;
  onShowHistory: () => void;
}) {
  const { user } = props;
  const [balance, setBalance] = useState<CreditBalanceSummary | null>(null);
  const [balError, setBalError] = useState('');

  const reloadBalance = useCallback(async () => {
    try {
      setBalance(await fetchBalance());
      setBalError('');
    } catch (e: any) {
      setBalError(e?.message || '加载余额失败');
    }
  }, []);

  useEffect(() => { reloadBalance(); }, [reloadBalance]);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-gradient-to-br from-blue-50 to-white p-4">
        <div className="rounded-full bg-blue-600 text-white p-2">
          <UserCircle2 size={22} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 truncate">{user.name || user.email}</p>
          <p className="text-xs text-gray-500 truncate flex items-center gap-1">
            <Mail size={12} /> {user.email}
          </p>
          <div className="mt-2 flex items-center gap-3 text-xs">
            <span className="rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 font-semibold">
              {user.tier ?? 'FREE'}
            </span>
            <span className="flex items-center gap-1 text-gray-600">
              <CreditCard size={12} /> {balance ? balance.total : (user.credits ?? 0)} credits
            </span>
          </div>
        </div>
      </div>

      <BalanceBreakdown balance={balance} error={balError} onRefresh={reloadBalance} />

      <BoundIdentities />

      <CreditPackages />

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600 space-y-1">
        <p>
          <span className="font-semibold">Server:</span> <code className="text-gray-700">{getCloudBaseUrl()}</code>
        </p>
        <p className="leading-relaxed">
          登录后即可使用 CoreFirst 提供的 AI 模型（默认 provider），下载课程，
          参与社区，并在多设备间同步学习进度。
        </p>
      </div>

      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { props.onRefresh(); reloadBalance(); }}
            className="text-xs text-blue-600 hover:underline"
          >
            刷新
          </button>
          <button
            onClick={props.onShowHistory}
            className="text-xs text-gray-600 hover:text-blue-600 flex items-center gap-1"
          >
            <History size={12} /> 账单
          </button>
        </div>
        <button
          onClick={props.onLogout}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-600"
        >
          <LogOut size={12} /> 退出登录
        </button>
      </div>
    </div>
  );
}

function BalanceBreakdown({ balance, error, onRefresh }: {
  balance: CreditBalanceSummary | null;
  error: string;
  onRefresh: () => void;
}) {
  if (error) {
    return (
      <p className="text-xs text-red-600 flex items-center gap-1">
        {error} · <button onClick={onRefresh} className="underline">重试</button>
      </p>
    );
  }
  if (!balance) {
    return <p className="text-xs text-gray-400 flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> 加载余额…</p>;
  }
  const buckets: Array<[string, number, string]> = [
    ['赠送',    balance.bySource.bonus,        'bg-amber-100 text-amber-700'],
    ['订阅',    balance.bySource.subscription, 'bg-purple-100 text-purple-700'],
    ['充值',    balance.bySource.top_up,       'bg-green-100 text-green-700'],
  ].filter(([, amt]) => Number(amt) > 0) as any;

  return (
    <div className="rounded-xl border border-gray-200 p-3 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-gray-700">credits 余额</span>
        <span className="text-gray-500">{balance.total} 可用</span>
      </div>
      {buckets.length === 0 ? (
        <p className="text-xs text-gray-400">暂无可用 credits。</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {buckets.map(([label, amt, cls]: any) => (
            <span key={label} className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${cls}`}>
              {label} {amt}
            </span>
          ))}
        </div>
      )}
      {balance.expiringSoon.in7Days > 0 && (
        <p className="text-[11px] text-orange-600">
          ⚠ {balance.expiringSoon.in7Days} credits 将在 7 天内过期
        </p>
      )}
    </div>
  );
}

function BoundIdentities() {
  const [items, setItems] = useState<BoundIdentity[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const reload = useCallback(async () => {
    try { setItems(await listMyIdentities()); setError(''); }
    catch (e: any) { setError(e?.message || '加载失败'); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  async function handleUnlink(provider: string) {
    setBusy(provider); setError('');
    try {
      await unlinkIdentity(provider);
      await reload();
    } catch (e: any) {
      if (e instanceof CloudError && e.code === 'LAST_CREDENTIAL') {
        setError('这是你唯一的登录方式，先设置密码再解绑。');
      } else {
        setError(e?.message || '解绑失败');
      }
    } finally {
      setBusy('');
    }
  }

  // Filter out 'stripe' — it's a payment binding, not a login method, and the
  // user shouldn't accidentally unbind it from here.
  const loginIdentities = items.filter(i => i.provider !== 'stripe');
  const linkedSet = new Set(loginIdentities.map(i => i.provider));

  async function handleLink(provider: 'google' | 'github') {
    try {
      await beginLinkExternalAccount(provider);
    } catch (e: any) {
      setError(e?.message || '绑定失败');
    }
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-gray-600">登录方式</p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <ul className="space-y-1">
        {(['google', 'github'] as const).map(provider => {
          const bound = linkedSet.has(provider);
          return (
            <li key={provider} className="flex items-center justify-between text-xs">
              <span className="text-gray-700 capitalize">
                {provider}
                {bound && <span className="ml-1.5 text-[10px] text-green-600">✓ 已绑定</span>}
              </span>
              {bound ? (
                <button
                  onClick={() => handleUnlink(provider)}
                  disabled={busy === provider}
                  className="text-[11px] text-gray-400 hover:text-red-600 disabled:opacity-50"
                >
                  解绑
                </button>
              ) : (
                <button
                  onClick={() => handleLink(provider)}
                  className="text-[11px] text-blue-600 hover:text-blue-700"
                >
                  + 绑定
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CreditPackages() {
  const [pkgs, setPkgs] = useState<CreditPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [buying, setBuying] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setPkgs(await listPackages());
      } catch (e: any) {
        setError(e?.message || '加载失败');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleBuy(pkg: CreditPackage) {
    setBuying(pkg.id);
    setError('');
    try {
      const res = await startCheckout(pkg.id);
      if (res.url) window.location.href = res.url;
      else setError('Checkout 暂未开通');
    } catch (e: any) {
      if (e instanceof CloudError && e.code === 'NOT_IMPLEMENTED') {
        setError('支付暂未接入（管理员尚未配置 Stripe）');
      } else {
        setError(e?.message || '购买失败');
      }
    } finally {
      setBuying('');
    }
  }

  if (loading) return <p className="text-xs text-gray-400">加载套餐…</p>;
  if (pkgs.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-gray-600">可购买套餐</p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="space-y-1.5">
        {pkgs.map(p => (
          <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs">
            <div className="min-w-0">
              <p className="font-medium text-gray-800 truncate">{p.name}</p>
              <p className="text-[10px] text-gray-500">
                {p.credits} credits {Number(p.bonusCredits) > 0 && `+ ${p.bonusCredits} 赠`}
                {p.interval !== 'one_time' && ` · ${p.interval}`}
              </p>
            </div>
            <button
              onClick={() => handleBuy(p)}
              disabled={!!buying}
              className="bg-blue-600 text-white px-3 py-1 rounded-md text-[11px] hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
            >
              {p.displayPrice} {p.displayCurrency}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// Transaction history (ledger viewer)
// ───────────────────────────────────────────────────────────────────────────────

const TX_LABELS: Record<string, string> = {
  credit_grant_initial:      '注册赠送',
  credit_subscription_grant: '订阅赠送',
  credit_top_up_grant:       '充值到账',
  credit_bonus_grant:        '奖励积分',
  credit_refund:             '退款',
  credit_revoke:             '积分撤销',
  book_purchase:             '购买课程',
  ai_chat_consumption:       'AI 对话',
  ai_image_consumption:      'AI 绘图',
  ai_tts_consumption:        'AI 语音合成',
  ai_stt_consumption:        'AI 语音识别',
  ai_byok_call:              'AI（自带 key）',
};

function TransactionHistory({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<CloudTransaction[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadPage = useCallback(async (cursor?: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await listTransactions({ limit: 50, cursor });
      setItems(prev => cursor ? [...prev, ...res.data] : res.data);
      setNextCursor(res.nextCursor);
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPage(); }, [loadPage]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-xs text-gray-500 hover:text-blue-600 flex items-center gap-1">
          <ChevronLeft size={14} /> 返回
        </button>
        <h4 className="font-semibold text-gray-900 text-sm flex items-center gap-1">
          <History size={14} /> 账单明细
        </h4>
        <span />
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {loading && items.length === 0 ? (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Loader2 size={12} className="animate-spin" /> 加载中…
        </div>
      ) : items.length === 0 ? (
        <p className="text-xs text-gray-400">还没有交易记录。</p>
      ) : (
        <ul className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
          {items.map(tx => {
            const amount = Number(tx.amount);
            const sign = amount > 0 ? '+' : amount < 0 ? '' : '';
            const cls =
              tx.status === 'failed' ? 'text-gray-400 line-through'
              : amount > 0 ? 'text-green-600'
              : amount < 0 ? 'text-red-600'
              : 'text-gray-500';
            return (
              <li key={tx.id} className="px-3 py-2 flex items-center justify-between gap-2 text-xs bg-white">
                <div className="min-w-0">
                  <p className="font-medium text-gray-800 truncate">
                    {TX_LABELS[tx.type] || tx.type}
                    {tx.status !== 'success' && (
                      <span className="ml-1 text-[10px] text-gray-400">[{tx.status}]</span>
                    )}
                  </p>
                  <p className="text-[10px] text-gray-400">
                    {new Date(tx.createdAt).toLocaleString()} · {tx.relatedId || tx.channel}
                  </p>
                </div>
                <span className={`font-mono whitespace-nowrap ${cls}`}>
                  {sign}{amount} {tx.currency || ''}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {nextCursor && (
        <button
          onClick={() => loadPage(nextCursor)}
          disabled={loading}
          className="w-full text-xs text-blue-600 py-2 hover:underline disabled:opacity-50"
        >
          {loading ? '加载中…' : '加载更多'}
        </button>
      )}
    </div>
  );
}

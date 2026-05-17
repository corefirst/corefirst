'use client';

/**
 * OAuth callback landing page.
 *
 * The SaaS server redirects here after a successful /v1/auth/oauth/:provider/callback,
 * placing tokens in the URL fragment (so they never hit any server log).
 *
 * Fragment shape on success:   #accessToken=...&refreshToken=...&userId=...
 * Fragment shape on failure:   #error=link_required&provider=google
 * Fragment shape on link:      #linked=google
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { writeSession } from '@/src/lib/saas/storage';
import { fetchCurrentUser } from '@/src/lib/saas/auth';

const ERROR_LABELS: Record<string, string> = {
  link_required:           '该邮箱已经注册了本地账号，请用密码登录后在「设置 → 会员」里手动绑定。',
  external_account_taken:  '该第三方账号已绑定到另一个用户。',
  state_mismatch:          '安全校验失败（state mismatch），请重试。',
  no_email_from_provider:  '第三方没有返回邮箱，无法登录。',
  email_not_verified:      '第三方邮箱未验证，无法登录。',
  missing_code_or_state:   '回调参数缺失。',
};

export default function OAuthCallbackPage() {
  const router = useRouter();
  const [state, setState] = useState<{ kind: 'pending' } | { kind: 'success' } | { kind: 'error'; message: string } | { kind: 'linked'; provider: string }>({ kind: 'pending' });

  useEffect(() => {
    /** Apply tokens / status from a URL whose fragment carries the OAuth params. */
    const handleUrl = (url: string) => {
      let hash = '';
      try { hash = new URL(url).hash.replace(/^#/, ''); }
      catch { hash = url.replace(/^[^#]*#/, ''); }
      const params = new URLSearchParams(hash);

      const error = params.get('error');
      if (error) {
        const provider = params.get('provider');
        const label = ERROR_LABELS[error] ?? `OAuth 错误：${error}`;
        setState({ kind: 'error', message: provider ? `${provider} · ${label}` : label });
        return;
      }

      const linked = params.get('linked');
      if (linked) {
        setState({ kind: 'linked', provider: linked });
        setTimeout(() => router.push('/'), 1500);
        return;
      }

      const accessToken  = params.get('accessToken');
      const refreshToken = params.get('refreshToken');
      const userId       = params.get('userId');

      if (!accessToken || !refreshToken || !userId) {
        setState({ kind: 'error', message: '未收到登录 token。' });
        return;
      }

      writeSession({
        accessToken,
        refreshToken,
        user: { id: userId, email: '' },
      });
      try { window.location.hash = ''; } catch {}
      fetchCurrentUser().finally(() => {
        setState({ kind: 'success' });
        setTimeout(() => router.push('/'), 800);
      });
    };

    // Web path: tokens already in our URL hash.
    if (window.location.hash) handleUrl(window.location.href);

    // Electron path: tokens arrive over IPC from the main process. We subscribe
    // even on web (the bridge is undefined there) so the code stays uniform.
    const unsub = window.__corefirstElectron?.onOAuthCallback((deepLinkUrl) => {
      handleUrl(deepLinkUrl);
    });
    return () => { unsub?.(); };
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white border border-gray-200 rounded-2xl p-8 max-w-md w-full text-center space-y-3 shadow-sm">
        {state.kind === 'pending' && <p className="text-gray-600 text-sm">正在登录…</p>}
        {state.kind === 'success' && <p className="text-green-600 text-sm">登录成功，正在跳回…</p>}
        {state.kind === 'linked' && <p className="text-green-600 text-sm">已绑定 {state.provider}，正在跳回…</p>}
        {state.kind === 'error' && (
          <>
            <p className="text-red-600 text-sm font-medium">登录失败</p>
            <p className="text-xs text-gray-600">{state.message}</p>
            <button
              onClick={() => router.push('/')}
              className="mt-2 text-xs text-blue-600 hover:underline"
            >
              返回首页
            </button>
          </>
        )}
      </div>
    </div>
  );
}

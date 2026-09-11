'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Lock, User } from 'lucide-react';
import { getSession, setSession, type AuthSession } from '@/lib/store/auth-store';

type LoginMode = 'none' | 'legacy_password' | 'managed';

function toAuthSession(session: {
  accountId: string;
  profileId: string;
  username?: string;
  name: string;
  role: AuthSession['role'];
  customPermissions?: AuthSession['customPermissions'];
  mode?: AuthSession['mode'];
}): AuthSession {
  return {
    accountId: session.accountId,
    profileId: session.profileId,
    username: session.username,
    name: session.name,
    role: session.role,
    customPermissions: session.customPermissions,
    mode: session.mode,
  };
}

/**
 * Guards the settings page behind the access password (ACCESS_PASSWORD / ACCOUNTS
 * or managed accounts). The rest of the app stays public.
 *
 * - If the visitor already holds a valid session, they pass straight through.
 * - If no auth is configured at all, settings stay public.
 * - Otherwise a password (and username, in managed mode) is required.
 */
export function SettingsPasswordGate({ children }: { children: React.ReactNode }) {
  const [isLocked, setIsLocked] = useState(true);
  const [isClient, setIsClient] = useState(false);
  const [persistSession, setPersistSession] = useState(true);
  const [loginMode, setLoginMode] = useState<LoginMode>('none');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isValidating, setIsValidating] = useState(false);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const mirroredSession = getSession();

      try {
        const [configRes, sessionRes] = await Promise.all([
          fetch('/api/auth'),
          fetch('/api/auth/session'),
        ]);

        if (!configRes.ok) {
          throw new Error('Failed to fetch auth config');
        }

        const config = await configRes.json();
        const sessionStatus = sessionRes.ok ? await sessionRes.json() : { authenticated: false, session: null };

        if (!mounted) return;

        setPersistSession(config.persistSession);
        setLoginMode(config.loginMode || 'none');

        const serverSession = sessionStatus.authenticated && sessionStatus.session
          ? toAuthSession(sessionStatus.session)
          : null;

        if (serverSession) {
          setSession(serverSession, config.persistSession);
          setIsLocked(false);
          setIsClient(true);
          return;
        }

        // No auth configured -> settings are public.
        if (!config.hasAuth && !mirroredSession) {
          setIsLocked(false);
          setIsClient(true);
          return;
        }

        // A stale mirrored session without a valid cookie must re-authenticate.
        setIsLocked(true);
        setIsClient(true);
      } catch {
        if (!mounted) return;
        // Fail open so a broken auth API never locks settings out entirely.
        setIsLocked(false);
        setIsClient(true);
      }
    };

    init();

    return () => {
      mounted = false;
    };
  }, []);

  const handleUnlock = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsValidating(true);
    setError('');

    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: loginMode === 'managed' ? username : undefined,
          password,
        }),
      });
      const data = await response.json();

      if (response.status === 503) {
        setError('认证存储暂时不可用，请检查 Upstash Redis 配置');
        setIsValidating(false);
        return;
      }

      if (data.valid && data.session) {
        setSession(toAuthSession(data.session), data.persistSession ?? persistSession);
        setIsLocked(false);
        setIsClient(true);
        setIsValidating(false);
        return;
      }
    } catch {
      // Ignore network errors and show the same message as invalid credentials.
    }

    setError(loginMode === 'managed' ? '用户名或密码错误' : '密码错误');
    setIsValidating(false);
    const form = document.getElementById('settings-password-form');
    form?.classList.add('animate-shake');
    setTimeout(() => form?.classList.remove('animate-shake'), 500);
  };

  if (!isClient) return null;

  if (!isLocked) {
    return <>{children}</>;
  }

  const showManagedFields = loginMode === 'managed';

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-color)] bg-[image:var(--bg-image)] text-[var(--text-color)]">
      <div className="w-full max-w-md p-4">
        <form
          id="settings-password-form"
          onSubmit={handleUnlock}
          className="bg-[var(--glass-bg)] backdrop-blur-[25px] saturate-[180%] border border-[var(--glass-border)] rounded-[var(--radius-2xl)] p-8 shadow-[var(--shadow-md)] flex flex-col items-center gap-6 transition-all duration-[0.4s] cubic-bezier(0.2,0.8,0.2,1)"
        >
          <div className="w-16 h-16 rounded-[var(--radius-full)] bg-[var(--accent-color)]/10 flex items-center justify-center text-[var(--accent-color)] mb-2 shadow-[var(--shadow-sm)] border border-[var(--glass-border)]">
            <Lock size={32} />
          </div>

          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold">设置受保护</h2>
            <p className="text-[var(--text-color-secondary)]">
              {showManagedFields ? '请输入用户名和密码以进入设置' : '请输入访问密码以进入设置'}
            </p>
          </div>

          <div className="w-full space-y-4">
            {showManagedFields && (
              <div className="space-y-2">
                <div className="relative">
                  <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-color-secondary)]" />
                  <input
                    type="text"
                    value={username}
                    onChange={(event) => {
                      setUsername(event.target.value);
                      setError('');
                    }}
                    placeholder="输入用户名..."
                    className="w-full pl-11 pr-4 py-3 rounded-[var(--radius-2xl)] bg-[var(--glass-bg)] border border-[var(--glass-border)] focus:outline-none focus:border-[var(--accent-color)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent-color)_30%,transparent)] transition-all duration-[0.4s] cubic-bezier(0.2,0.8,0.2,1) text-[var(--text-color)] placeholder-[var(--text-color-secondary)]"
                    autoComplete="username"
                    autoFocus
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <input
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError('');
                }}
                placeholder="输入密码..."
                className={`w-full px-4 py-3 rounded-[var(--radius-2xl)] bg-[var(--glass-bg)] border ${error ? 'border-red-500' : 'border-[var(--glass-border)]'} focus:outline-none focus:border-[var(--accent-color)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent-color)_30%,transparent)] transition-all duration-[0.4s] cubic-bezier(0.2,0.8,0.2,1) text-[var(--text-color)] placeholder-[var(--text-color-secondary)]`}
                autoFocus={!showManagedFields}
                autoComplete={showManagedFields ? 'current-password' : 'off'}
              />
              {error && (
                <p className="text-sm text-red-500 text-center animate-pulse">
                  {error}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isValidating}
              className="w-full py-3 px-4 bg-[var(--accent-color)] text-white font-bold rounded-[var(--radius-2xl)] hover:translate-y-[-2px] hover:brightness-110 shadow-[var(--shadow-sm)] hover:shadow-[0_4px_8px_var(--shadow-color)] active:translate-y-0 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isValidating ? '验证中...' : '进入设置'}
            </button>
          </div>

          <Link
            href="/"
            className="text-sm text-[var(--text-color-secondary)] hover:text-[var(--text-color)] transition-colors"
          >
            返回首页
          </Link>
        </form>
      </div>
      <style jsx global>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        .animate-shake {
          animation: shake 0.3s cubic-bezier(.36,.07,.19,.97) both;
        }
      `}</style>
    </div>
  );
}

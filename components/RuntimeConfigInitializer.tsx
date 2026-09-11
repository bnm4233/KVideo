'use client';

import { useEffect } from 'react';
import { clearSession, getSession, setSession, type AuthSession } from '@/lib/store/auth-store';
import { useSubscriptionSync } from '@/lib/hooks/useSubscriptionSync';
import { hasStoredAppSetting, settingsStore } from '@/lib/store/settings-store';
import { useIPTVStore } from '@/lib/store/iptv-store';

function syncIPTVSources(rawValue: string) {
  const iptvStore = useIPTVStore.getState();

  let entries: { name: string; url: string }[] = [];

  try {
    const parsed = JSON.parse(rawValue);
    if (Array.isArray(parsed)) {
      entries = parsed.filter((item: unknown): item is { name: string; url: string } => {
        if (!item || typeof item !== 'object') return false;
        const candidate = item as { name?: unknown; url?: unknown };
        return typeof candidate.url === 'string';
      });
    }
  } catch {
    if (rawValue.includes('http')) {
      const urls = rawValue.split(',').map((value) => value.trim()).filter((value) => value.startsWith('http'));
      entries = urls.map((url, index) => ({
        name: urls.length > 1 ? `直播源 ${index + 1}` : '直播源',
        url,
      }));
    }
  }

  iptvStore.syncBuiltinSources(entries);
}

function syncMergeSources(rawValue: string) {
  const enabled = rawValue === 'true' || rawValue === '1';
  if (!enabled) return;

  const settings = settingsStore.getSettings();
  if (settings.searchDisplayMode !== 'grouped') {
    settingsStore.saveSettings({
      ...settings,
      searchDisplayMode: 'grouped',
    });
  }
}

function syncDanmakuApiUrl(rawValue: string) {
  if (!rawValue || hasStoredAppSetting('danmakuApiUrl')) return;

  const settings = settingsStore.getSettings();
  if (settings.danmakuApiUrl !== rawValue) {
    settingsStore.saveSettings({
      ...settings,
      danmakuApiUrl: rawValue,
    });
  }
}

function applyRuntimeConfig(data: {
  subscriptionSources?: string;
  iptvSources?: string;
  mergeSources?: string;
  danmakuApiUrl?: string;
}) {
  if (data.subscriptionSources) {
    settingsStore.syncEnvSubscriptions(data.subscriptionSources);
  }

  if (data.iptvSources) {
    syncIPTVSources(data.iptvSources);
  }

  if (data.mergeSources) {
    syncMergeSources(data.mergeSources);
  }

  if (data.danmakuApiUrl) {
    syncDanmakuApiUrl(data.danmakuApiUrl);
  }
}

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
 * Applies server-provided runtime configuration (env-injected sources, etc.) and
 * mirrors the server session into client storage.
 *
 * This used to live inside the global PasswordGate. It is now decoupled so the app
 * can boot without a global password while still applying runtime config and session.
 */
export function RuntimeConfigInitializer() {
  useSubscriptionSync();

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

        applyRuntimeConfig(config);

        const serverSession = sessionStatus.authenticated && sessionStatus.session
          ? toAuthSession(sessionStatus.session)
          : null;

        if (serverSession) {
          setSession(serverSession, config.persistSession);
        } else if (mirroredSession) {
          clearSession();
        }
      } catch {
        // Runtime config sync is best-effort; never block the app.
      }
    };

    init();

    return () => {
      mounted = false;
    };
  }, []);

  return null;
}

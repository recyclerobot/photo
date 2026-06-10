import { useEffect, useState } from 'react';

interface LocalFontData {
  family: string;
  fullName: string;
  postscriptName: string;
  style: string;
}

declare global {
  interface Window {
    queryLocalFonts?: (options?: { postscriptNames?: string[] }) => Promise<LocalFontData[]>;
  }
}

export type LocalFontsStatus = 'idle' | 'loading' | 'loaded' | 'denied';

// Module-level cache: the permission prompt + enumeration only happen once per
// page load, no matter how many components use the hook.
let cachedFamilies: string[] | null = null;

/**
 * Enumerate the user's installed fonts via the Local Font Access API
 * (Chromium-only, secure contexts). `load` must be called from a user gesture
 * the first time — it triggers a permission prompt. If permission was granted
 * in a previous session, fonts load automatically on mount.
 */
export function useLocalFonts() {
  const supported = typeof window !== 'undefined' && typeof window.queryLocalFonts === 'function';
  const [fonts, setFonts] = useState<string[]>(cachedFamilies ?? []);
  const [status, setStatus] = useState<LocalFontsStatus>(cachedFamilies ? 'loaded' : 'idle');

  const load = async () => {
    if (!window.queryLocalFonts) return;
    if (cachedFamilies) {
      setFonts(cachedFamilies);
      setStatus('loaded');
      return;
    }
    setStatus('loading');
    try {
      const data = await window.queryLocalFonts();
      const families = [...new Set(data.map((f) => f.family))].sort((a, b) => a.localeCompare(b));
      cachedFamilies = families;
      setFonts(families);
      setStatus('loaded');
    } catch {
      setStatus('denied');
    }
  };

  useEffect(() => {
    if (!supported || cachedFamilies) return;
    let stale = false;
    navigator.permissions
      ?.query({ name: 'local-fonts' as PermissionName })
      .then((p) => {
        if (!stale && p.state === 'granted') void load();
      })
      .catch(() => {
        // Permission name unknown in this browser — wait for the user gesture.
      });
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported]);

  return { supported, fonts, status, load };
}

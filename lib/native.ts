// Native (iOS) integration. Every export is a no-op on the web build, so the
// GitHub Pages app behaves exactly as before.
import { Capacitor } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();

const PREFIX = 'sleeve.';

// WKWebView localStorage can be purged by iOS under storage pressure, so on
// native every `sleeve.*` key is mirrored into the app's own UserDefaults
// (via @capacitor/preferences) and restored from there before the app renders.
export async function initNative() {
  if (!isNative) return;
  const [{ Preferences }, { SplashScreen }] = await Promise.all([
    import('@capacitor/preferences'),
    import('@capacitor/splash-screen'),
  ]);
  try {
    const { keys } = await Preferences.keys();
    const saved = keys.filter(key => key.startsWith(PREFIX));
    if (saved.length) {
      for (const key of saved) {
        const { value } = await Preferences.get({ key });
        if (value !== null) localStorage.setItem(key, value);
      }
    } else {
      // First launch on this version: seed the durable store from whatever exists.
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(PREFIX)) await Preferences.set({ key, value: localStorage.getItem(key) ?? '' });
      }
    }
  } catch {}

  const setItem = Storage.prototype.setItem;
  const removeItem = Storage.prototype.removeItem;
  Storage.prototype.setItem = function (key: string, value: string) {
    setItem.call(this, key, value);
    if (this === localStorage && key.startsWith(PREFIX)) Preferences.set({ key, value }).catch(() => {});
  };
  Storage.prototype.removeItem = function (key: string) {
    removeItem.call(this, key);
    if (this === localStorage && key.startsWith(PREFIX)) Preferences.remove({ key }).catch(() => {});
  };

  installNativeFetch();
  document.documentElement.classList.add('native');
  // Open external links (Apple Music, Spotify) in their apps / Safari.
  document.addEventListener('click', event => {
    const link = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!link || !/^https?:/.test(link.href) || new URL(link.href).host === location.host) return;
    event.preventDefault();
    window.open(link.href, '_blank');
  }, true);
  SplashScreen.hide().catch(() => {});
}

export async function setNativeTheme(dark: boolean) {
  if (!isNative) return;
  const { StatusBar, Style } = await import('@capacitor/status-bar');
  StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {});
}

export async function haptic(kind: 'light' | 'success' | 'warning' = 'light') {
  if (!isNative) return;
  const { Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics');
  if (kind === 'light') Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  else Haptics.notification({ type: kind === 'success' ? NotificationType.Success : NotificationType.Warning }).catch(() => {});
}

// Browsers download via <a download>; iOS has no Downloads folder, so write the
// file to the cache and hand it to the system share sheet (Save to Files, AirDrop…).
export async function shareFile(filename: string, data: string) {
  const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ]);
  const { uri } = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache, encoding: Encoding.UTF8 });
  try {
    await Share.share({ title: filename, files: [uri] });
  } catch (error) {
    if (!/cancel/i.test(String((error as Error)?.message ?? error))) throw error;
  }
}

// Share an image (e.g. a recap card) through the iOS share sheet.
export async function shareImage(filename: string, blob: Blob) {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ]);
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  const { uri } = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache });
  try {
    await Share.share({ title: filename, files: [uri] });
  } catch (error) {
    if (!/cancel/i.test(String((error as Error)?.message ?? error))) throw error;
  }
}

// The music APIs (iTunes Search, Apple RSS, Spotify oEmbed) don't send CORS
// headers for the app's capacitor:// origin, so in the app these requests go
// through iOS's native networking instead of the web view.
const NATIVE_HOSTS = /^https:\/\/(itunes\.apple\.com|rss\.marketingtools\.apple\.com|open\.spotify\.com|ws\.audioscrobbler\.com)\//;
function installNativeFetch() {
  const webFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!NATIVE_HOSTS.test(url) || (init?.method && init.method !== 'GET')) return webFetch(input, init);
    const signal = init?.signal;
    if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    const { CapacitorHttp } = await import('@capacitor/core');
    const request = CapacitorHttp.get({ url, responseType: 'text', connectTimeout: 15000, readTimeout: 20000 });
    const aborted = new Promise<never>((_, reject) => signal?.addEventListener('abort',
      () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError')), { once: true }));
    const response = await Promise.race([request, aborted]);
    const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    return new Response(body, { status: response.status, headers: { 'content-type': 'application/json' } });
  };
}

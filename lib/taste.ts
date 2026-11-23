// Taste sharing and recaps. No server and no account: a shared profile travels
// inside the link itself (compressed into the URL hash, which is never sent to a server).
import type { Rating, Song } from './local-library';

export type SharedRecord = { k: 't' | 'a'; i: number | string; t: string; r: string; s: number; art?: string; f?: 1 };
export type SharedProfile = { v: 1; n: string; at: string; items: SharedRecord[] };

const MAX_SHARED = 40;
const keyOf = (kind: 't' | 'a', id: number | string) => (kind === 'a' ? 'album' : 'track') + ':' + id;
export const sharedKey = (item: SharedRecord) => keyOf(item.k, item.i);
export const ratingKey = (rating: Rating) => (rating.song.kind || 'track') + ':' + rating.song.id;

// Favourites first, then highest scores, so the link carries what defines your taste.
export function profileFrom(ratings: Rating[], name: string): SharedProfile {
  const items = [...ratings]
    .sort((a, b) => Number(Boolean(b.favourite)) - Number(Boolean(a.favourite)) || b.score - a.score || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_SHARED)
    .map(r => ({ k: r.song.kind === 'album' ? 'a' as const : 't' as const, i: r.song.id, t: r.song.title.slice(0, 80),
      r: r.song.artist.slice(0, 60), s: r.score, ...(r.song.art && { art: r.song.art }), ...(r.favourite && { f: 1 as const }) }));
  return { v: 1, n: name.trim().slice(0, 40), at: new Date().toISOString(), items };
}

function toBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
function fromBase64Url(text: string) {
  const binary = atob(text.replaceAll('-', '+').replaceAll('_', '/'));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const output = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(output).arrayBuffer());
}

export async function encodeProfile(profile: SharedProfile) {
  return toBase64Url(await pipe(new TextEncoder().encode(JSON.stringify(profile)), new CompressionStream('deflate-raw')));
}

const safeArt = (value: unknown) => {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && /(^|\.)(mzstatic\.com|scdn\.co|spotifycdn\.com)$/.test(url.hostname) ? url.href : undefined;
  } catch { return undefined; }
};

// Shared links come from other people, so validate every field before showing it.
export async function decodeProfile(encoded: string): Promise<SharedProfile> {
  if (encoded.length > 20000) throw new Error('That taste link is too long.');
  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder().decode(await pipe(fromBase64Url(encoded), new DecompressionStream('deflate-raw'))));
  } catch {
    throw new Error('That taste link is broken. Ask your friend to share it again.');
  }
  const profile = data as Partial<SharedProfile>;
  if (profile?.v !== 1 || !Array.isArray(profile.items)) throw new Error('That taste link is from a newer version of Sleeve.');
  const items: SharedRecord[] = [];
  for (const item of profile.items.slice(0, MAX_SHARED)) {
    const okId = (typeof item?.i === 'number' && Number.isSafeInteger(item.i) && item.i > 0) || (typeof item?.i === 'string' && /^[a-zA-Z0-9]{22}$/.test(item.i));
    if (!okId || (item.k !== 't' && item.k !== 'a') || typeof item.t !== 'string' || typeof item.r !== 'string' ||
      typeof item.s !== 'number' || !Number.isFinite(item.s) || item.s < 0 || item.s > 10) continue;
    const art = safeArt(item.art);
    items.push({ k: item.k, i: item.i, t: item.t.slice(0, 80), r: item.r.slice(0, 60), s: Math.round(item.s * 10) / 10,
      ...(art && { art }), ...(item.f === 1 && { f: 1 as const }) });
  }
  return { v: 1, n: typeof profile.n === 'string' ? profile.n.slice(0, 40) : '', at: String(profile.at || ''), items };
}

export function sharedSong(item: SharedRecord): Song {
  const apple = typeof item.i === 'number';
  const kind = item.k === 'a' ? 'album' : 'track';
  return { id: item.i, title: item.t, artist: item.r, album: item.k === 'a' ? item.t : '', art: item.art || '', genre: '', year: '',
    kind, source: apple ? 'apple' : 'spotify',
    url: apple ? '' : 'https://open.spotify.com/' + kind + '/' + item.i };
}

export type Comparison = {
  match: number | null;                       // 0–100, null when nothing in common
  shared: { item: SharedRecord; mine: Rating }[];
  theirPicks: SharedRecord[];                 // their top records you haven't rated
  artistsInCommon: string[];
};

// Match blends how closely you score the same records with how many artists you share.
export function compare(mine: Rating[], theirs: SharedProfile): Comparison {
  const byKey = new Map(mine.map(r => [ratingKey(r), r]));
  const shared = theirs.items.flatMap(item => { const r = byKey.get(sharedKey(item)); return r ? [{ item, mine: r }] : []; });
  const lower = (s: string) => s.trim().toLowerCase();
  const myArtists = new Set(mine.map(r => lower(r.song.artist)).filter(Boolean));
  const artistsInCommon = [...new Set(theirs.items.map(i => i.r).filter(a => a && myArtists.has(lower(a))))];
  const theirArtists = new Set(theirs.items.map(i => lower(i.r)).filter(Boolean));
  let match: number | null = null;
  if (shared.length || artistsInCommon.length) {
    const agreement = shared.length ? 1 - shared.reduce((sum, x) => sum + Math.abs(x.item.s - x.mine.score), 0) / shared.length / 10 : 0.5;
    const overlap = theirArtists.size ? Math.min(1, artistsInCommon.length / Math.min(theirArtists.size, Math.max(myArtists.size, 1)) * 2) : 0;
    const weight = Math.min(1, shared.length / 5);
    match = Math.round(100 * (agreement * (0.5 + 0.3 * weight) + overlap * (0.5 - 0.3 * weight)));
  }
  const theirPicks = theirs.items.filter(i => !byKey.has(sharedKey(i)) && i.s >= 7).slice(0, 12);
  return { match, shared, theirPicks, artistsInCommon };
}

export type Period = 'month' | 'year' | 'all';

export function inPeriod(ratings: Rating[], period: Period, now = new Date()) {
  if (period === 'all') return ratings;
  const prefix = now.toISOString().slice(0, period === 'month' ? 7 : 4);
  return ratings.filter(r => r.updatedAt.startsWith(prefix));
}

export function periodLabel(period: Period, now = new Date()) {
  if (period === 'all') return 'All time';
  return period === 'year' ? String(now.getFullYear()) : now.toLocaleString('en', { month: 'long', year: 'numeric' });
}

// Consecutive days (ending today or yesterday) on which you rated something.
export function ratingStreak(ratings: Rating[], now = new Date()) {
  const day = (d: Date) => d.toLocaleDateString('en-CA');
  const days = new Set(ratings.map(r => day(new Date(r.updatedAt))));
  const cursor = new Date(now);
  if (!days.has(day(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(day(cursor))) { streak++; cursor.setDate(cursor.getDate() - 1); }
  return streak;
}

export function tasteLabel(ratings: Rating[]) {
  if (ratings.length < 3) return 'Just getting started';
  const avg = ratings.reduce((s, r) => s + r.score, 0) / ratings.length;
  const spread = Math.sqrt(ratings.reduce((s, r) => s + (r.score - avg) ** 2, 0) / ratings.length);
  const genres = new Set(ratings.map(r => r.song.genre).filter(Boolean)).size;
  if (genres >= 8) return 'Genre explorer';
  if (avg >= 8.2) return 'Easy to impress';
  if (avg <= 5.5) return 'Tough critic';
  if (spread >= 2.2) return 'Strong opinions';
  return 'Balanced listener';
}

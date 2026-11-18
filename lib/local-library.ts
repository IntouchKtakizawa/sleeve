export type Song = {
  id: number | string;
  title: string;
  artist: string;
  album: string;
  art: string;
  url: string;
  genre: string;
  year: string;
  kind?: 'track' | 'album';
  source?: 'apple' | 'spotify';
  albumId?: number;
  albumUrl?: string;
  duration?: number;
  trackCount?: number;
  group?: string;
};

export function songKey(song: Song) {
  return (song.kind || 'track') + ':' + song.id;
}

export type Rating = { trackId: Song['id']; song: Song; score: number; note: string; updatedAt: string; favourite?: boolean };
export const STORAGE_KEY = 'sleeve.library.v1';

function fail(): never {
  throw new Error('Choose a valid Sleeve JSON backup. Your collection is safe.');
}

function safeUrl(value: unknown, domain: RegExp) {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && domain.test(url.hostname) ? url.href : '';
  } catch {
    return '';
  }
}

function isAppleId(id: unknown): id is number {
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0;
}

export function validateRatings(value: unknown): Rating[] {
  if (!Array.isArray(value) || value.length > 10000) return fail();
  return value.map(rating => {
    const item = rating?.song;
    const spotify = item?.source === 'spotify';
    const validId = spotify ? typeof item.id === 'string' && /^[a-zA-Z0-9]{22}$/.test(item.id) : isAppleId(item?.id);
    if (!item || !validId || rating.trackId !== item.id || typeof item.title !== 'string' || !item.title.trim() ||
      typeof item.artist !== 'string' || typeof rating.score !== 'number' || !Number.isFinite(rating.score) ||
      rating.score < 0 || rating.score > 10 || typeof rating.note !== 'string' || rating.note.length > 1000 ||
      typeof rating.updatedAt !== 'string' || !Number.isFinite(Date.parse(rating.updatedAt))) return fail();

    const apple = /^(music|itunes)\.apple\.com$/;
    const song: Song = {
      id: item.id, title: item.title.slice(0, 250), artist: item.artist.slice(0, 250),
      album: String(item.album || '').slice(0, 250), genre: String(item.genre || '').slice(0, 80),
      year: String(item.year || '').slice(0, 4),
      art: safeUrl(item.art, spotify ? /(^|\.)(scdn\.co|spotifycdn\.com)$/ : /(^|\.)mzstatic\.com$/),
      url: safeUrl(item.url, spotify ? /^open\.spotify\.com$/ : apple),
      ...(item.source && { source: spotify ? 'spotify' : 'apple' }),
      ...(item.kind === 'album' && { kind: 'album' }),
      ...(isAppleId(item.albumId) && { albumId: item.albumId, albumUrl: safeUrl(item.albumUrl, apple) }),
      ...(Number.isFinite(item.duration) && { duration: item.duration }),
      ...(Number.isSafeInteger(item.trackCount) && { trackCount: item.trackCount }),
    };
    return {
      trackId: song.id, song, score: Math.round(rating.score * 10) / 10, note: rating.note,
      updatedAt: new Date(rating.updatedAt).toISOString(), favourite: rating.favourite === true,
    };
  });
}

export function parseBackup(raw: string): Rating[] {
  const data = JSON.parse(raw);
  if (data?.app !== 'sleeve' || data.version !== 1) return fail();
  return mergeRatings([], validateRatings(data.ratings));
}

export function mergeRatings(existing: Rating[], incoming: Rating[]): Rating[] {
  const merged = new Map<string, Rating>();
  for (const rating of [...existing, ...incoming]) {
    const key = songKey(rating.song);
    const old = merged.get(key);
    if (!old || rating.updatedAt >= old.updatedAt) merged.set(key, rating);
  }
  return [...merged.values()];
}

export function backup(ratings: Rating[]) {
  return JSON.stringify({ app: 'sleeve', version: 1, exportedAt: new Date().toISOString(), ratings }, null, 2);
}

export function csv(ratings: Rating[]) {
  const cell = (value: unknown) => '"' + String(value ?? '').replace(/^[=+\-@\t\r]/, "'$&").replaceAll('"', '""') + '"';
  const rows = ratings.map(r => [r.song.title, r.song.artist, r.song.album, r.score, r.favourite ? 'Yes' : 'No',
    r.note, r.updatedAt, r.song.kind === 'album' ? 'Album' : 'Song']);
  return '\uFEFF' + [['Song', 'Artist', 'Album', 'Score', 'Favourite', 'Notes', 'Rated at', 'Type'], ...rows]
    .map(row => row.map(cell).join(',')).join('\r\n');
}

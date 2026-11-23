// Listening history: what you actually played, so Sleeve can ask you to rate it
// instead of making you search for everything by hand.
//
// Two sources, both without Spotify's locked-down Web API:
//  - Last.fm (free API). Last.fm records plays from Spotify, Apple Music and most players.
//  - Spotify's own "Download your data" export (StreamingHistory*.json / Streaming_History_Audio*.json).
import type { Song } from './local-library';

export type Play = {
  key: string;        // normalised artist + title, used for de-duplication
  title: string;
  artist: string;
  album: string;
  image: string;      // https artwork from the source, if any
  playedAt: string;   // ISO time of the most recent play
  plays: number;      // number of plays counted in this batch
  nowPlaying?: boolean;
};

export const LASTFM_USER_KEY = 'sleeve.lastfm.user.v1';
export const LASTFM_API_KEY = 'sleeve.lastfm.key.v1';
export const PLAYS_KEY = 'sleeve.plays.v1';
export const DISMISSED_KEY = 'sleeve.plays.dismissed.v1';

export function normalize(value: string) {
  return value.normalize('NFKD').toLowerCase()
    .replace(/\s*[([][^)\]]*(?:feat\.?|with|remaster|remastered|deluxe|live|version|edit|mono|stereo)[^)\]]*[)\]]/g, '')
    .replace(/\s+-\s+(?:\d{4}\s+)?(?:remaster(?:ed)?|live|single version|radio edit|mono|stereo).*$/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

export function playKey(artist: string, title: string) {
  return normalize(artist) + '|' + normalize(title);
}

function httpsOrEmpty(value: unknown) {
  return typeof value === 'string' && /^https:\/\//.test(value) ? value : '';
}

// Combine plays of the same song, summing counts and keeping the latest time.
export function mergePlays(...lists: Play[][]): Play[] {
  const merged = new Map<string, Play>();
  for (const play of lists.flat()) {
    const old = merged.get(play.key);
    if (!old) { merged.set(play.key, { ...play }); continue; }
    const newer = play.playedAt > old.playedAt ? play : old;
    merged.set(play.key, { ...newer, plays: old.plays + play.plays, image: newer.image || old.image || play.image,
      album: newer.album || old.album, nowPlaying: old.nowPlaying || play.nowPlaying });
  }
  return [...merged.values()].sort((a, b) => b.playedAt.localeCompare(a.playedAt));
}

type LastfmTrack = {
  name?: string; artist?: { '#text'?: string; name?: string }; album?: { '#text'?: string };
  image?: { size?: string; '#text'?: string }[]; date?: { uts?: string }; '@attr'?: { nowplaying?: string };
};

export function parseLastfm(data: unknown): Play[] {
  const response = data as { error?: number; message?: string; recenttracks?: { track?: LastfmTrack | LastfmTrack[] } };
  if (response?.error) throw new Error(response.message || 'Last.fm could not load that profile.');
  const raw = response?.recenttracks?.track;
  const tracks = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const plays: Play[] = [];
  for (const track of tracks) {
    const title = track.name?.trim();
    const artist = (track.artist?.['#text'] || track.artist?.name || '').trim();
    if (!title || !artist) continue;
    const nowPlaying = track['@attr']?.nowplaying === 'true';
    const uts = Number(track.date?.uts);
    const image = httpsOrEmpty(track.image?.find(i => i.size === 'extralarge')?.['#text'] || track.image?.at(-1)?.['#text']);
    plays.push({
      key: playKey(artist, title), title, artist, album: track.album?.['#text']?.trim() || '',
      // Last.fm's blank "star" placeholder isn't real artwork.
      image: image.includes('2a96cbd8b46e442fc41c2b86b821562f') ? '' : image,
      playedAt: (nowPlaying || !Number.isFinite(uts) ? new Date() : new Date(uts * 1000)).toISOString(),
      plays: 1, ...(nowPlaying && { nowPlaying }),
    });
  }
  return mergePlays(plays);
}

export async function fetchLastfm(user: string, apiKey: string, signal: AbortSignal): Promise<Play[]> {
  const params = new URLSearchParams({ method: 'user.getrecenttracks', user: user.trim(), api_key: apiKey.trim(),
    format: 'json', limit: '200', extended: '0' });
  const response = await fetch('https://ws.audioscrobbler.com/2.0/?' + params, { signal });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    const message = (data as { message?: string } | null)?.message;
    throw new Error(message || 'Last.fm is unavailable right now. Try again in a moment.');
  }
  return parseLastfm(data);
}

type SpotifyRow = {
  // Account data export (StreamingHistory_music_0.json)
  endTime?: string; artistName?: string; trackName?: string; msPlayed?: number;
  // Extended streaming history (Streaming_History_Audio_2024.json)
  ts?: string; master_metadata_track_name?: string | null; master_metadata_album_artist_name?: string | null;
  master_metadata_album_album_name?: string | null; ms_played?: number;
};

// Spotify counts a stream after 30 seconds; skips shorter than that aren't real listens.
const MIN_PLAY_MS = 30_000;

export function parseSpotifyHistory(raw: string): Play[] {
  let rows: unknown;
  try { rows = JSON.parse(raw); } catch { throw new Error('That file isn’t valid JSON. Choose a StreamingHistory file from your Spotify data export.'); }
  if (!Array.isArray(rows)) throw new Error('Choose a StreamingHistory file from your Spotify data export.');
  const plays: Play[] = [];
  for (const row of rows as SpotifyRow[]) {
    if (!row || typeof row !== 'object') continue;
    const title = (row.trackName ?? row.master_metadata_track_name ?? '').trim();
    const artist = (row.artistName ?? row.master_metadata_album_artist_name ?? '').trim();
    const ms = row.msPlayed ?? row.ms_played ?? 0;
    const when = Date.parse(row.ts ?? (row.endTime ? row.endTime.replace(' ', 'T') + 'Z' : ''));
    if (!title || !artist || ms < MIN_PLAY_MS || !Number.isFinite(when)) continue;
    plays.push({ key: playKey(artist, title), title, artist, album: (row.master_metadata_album_album_name ?? '').trim(),
      image: '', playedAt: new Date(when).toISOString(), plays: 1 });
  }
  if (!plays.length) throw new Error('No songs found in that file. Spotify exports podcasts separately — choose a music history file.');
  return mergePlays(plays);
}

// Find the Apple Music catalogue entry for a play, so it gets artwork, previews and links.
export async function matchPlay(play: Play, search: (query: string, signal: AbortSignal) => Promise<Song[]>,
  signal: AbortSignal): Promise<Song | undefined> {
  const results = await search(play.title + ' ' + play.artist, signal);
  const artist = normalize(play.artist), title = normalize(play.title);
  const artistMatches = (song: Song) => { const a = normalize(song.artist); return a.includes(artist) || artist.includes(a); };
  const literal = (s: string) => s.trim().toLowerCase();
  return results.find(song => literal(song.title) === literal(play.title) && artistMatches(song))
    || results.find(song => normalize(song.title) === title && artistMatches(song))
    || results.find(song => artistMatches(song) && (normalize(song.title).includes(title) || title.includes(normalize(song.title))));
}

export function storedPlays(raw: string | null): Play[] {
  try {
    const value = JSON.parse(raw || '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((p): p is Play => p && typeof p.key === 'string' && typeof p.title === 'string' &&
      typeof p.artist === 'string' && typeof p.playedAt === 'string' && typeof p.plays === 'number').slice(0, 5000);
  } catch {
    return [];
  }
}

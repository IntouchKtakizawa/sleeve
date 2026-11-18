import discovery from './discovery.json';

import { songKey, type Song } from './local-library';
export type { Song } from './local-library';

export type Kind = 'track' | 'album';
export const discoveryTracks = discovery as Song[];
export const genres = ['All genres', ...new Set(discoveryTracks.map(song => song.group || song.genre))];

export function albumFor(song: Song): Song | undefined {
  if (song.kind === 'album') return song;
  if (!song.albumId || !song.album) return;
  const url = song.albumUrl?.replace(/([?&])i=[^&]*&?/, '$1').replace(/[?&]$/, '') || '';
  return { ...song, id: song.albumId, title: song.album, kind: 'album', url, duration: undefined };
}

export function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function spotifySearch(query: string) {
  return 'https://open.spotify.com/search/' + encodeURIComponent(query);
}

type AppleItem = {
  trackId?: number;
  trackName?: string;
  artistName: string;
  collectionId: number;
  collectionName: string;
  artworkUrl100?: string;
  trackViewUrl?: string;
  collectionViewUrl?: string;
  primaryGenreName?: string;
  releaseDate?: string;
  trackTimeMillis?: number;
  trackCount?: number;
};

export async function searchApple(query: string, kind: Kind, signal: AbortSignal): Promise<Song[]> {
  const params = new URLSearchParams({ term: query, entity: kind === 'track' ? 'song' : 'album', media: 'music', limit: '36', country: 'US' });
  const response = await fetch('https://itunes.apple.com/search?' + params, { signal });
  if (!response.ok) throw new Error('Apple Music is unavailable right now. Try again in a moment.');
  const data: { results: AppleItem[] } = await response.json();
  const found = new Map<string, Song>();
  for (const item of data.results) {
    const id = kind === 'track' ? item.trackId : item.collectionId;
    const title = kind === 'track' ? item.trackName : item.collectionName;
    if (!id || !title || !item.artistName) continue;
    const song: Song = {
      id, title, artist: item.artistName, album: item.collectionName || '',
      art: item.artworkUrl100?.replace('100x100bb', '600x600bb') || '',
      url: (kind === 'track' ? item.trackViewUrl : item.collectionViewUrl) || '',
      genre: item.primaryGenreName || '', year: item.releaseDate?.slice(0, 4) || '',
      kind, source: 'apple', albumId: item.collectionId, albumUrl: item.collectionViewUrl,
      duration: item.trackTimeMillis, trackCount: item.trackCount,
    };
    found.set(songKey(song), song);
  }
  return [...found.values()];
}

export async function loadSpotifyLink(value: string, signal: AbortSignal): Promise<Song> {
  let input: URL;
  try {
    input = new URL(value.trim());
  } catch {
    throw new Error('Paste a Spotify song or album link.');
  }
  const match = /^\/(?:intl-[a-z]{2}\/)?(track|album)\/([a-zA-Z0-9]{22})\/?$/.exec(input.pathname);
  if (input.protocol !== 'https:' || input.hostname !== 'open.spotify.com' || !match) {
    throw new Error('Paste a song or album link from open.spotify.com.');
  }
  const [, kind, id] = match;
  const url = 'https://open.spotify.com/' + kind + '/' + id;
  const response = await fetch('https://open.spotify.com/oembed?' + new URLSearchParams({ url }), { signal });
  if (!response.ok) throw new Error('Spotify could not load that link. Check the link and try again.');
  const item: { title?: string; thumbnail_url?: string } = await response.json();
  if (!item.title) throw new Error('Spotify did not return a title for that link.');
  return { id, url, kind: kind as Kind, source: 'spotify', title: item.title, artist: '', album: kind === 'album' ? item.title : '',
    art: item.thumbnail_url || '', genre: '', year: '' };
}

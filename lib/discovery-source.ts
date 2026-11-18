import { discoveryPool, discoveryTracks, genres, searchApple, shuffled, type Kind, type Song } from './catalogue';

const allGenres = genres[0];
const storefronts = ['US', 'GB', 'CA', 'AU', 'TH', 'JP', 'KR', 'DE', 'FR', 'BR', 'MX', 'IN'];
const genreTerms: Record<string, string[]> = {
  Pop: ['pop', 'synth pop', 'dance pop', 'dream pop', 'electropop', 'power pop'],
  Rock: ['rock', 'hard rock', 'grunge', 'punk rock', 'progressive rock', 'garage rock'],
  Indie: ['indie', 'indie rock', 'indie folk', 'shoegaze', 'alternative rock', 'post punk'],
  Electronic: ['house', 'techno', 'ambient', 'electronic', 'drum and bass', 'trip hop', 'downtempo'],
  'Jazz & Soul': ['jazz', 'soul', 'funk', 'bossa nova', 'neo soul', 'fusion', 'motown'],
  'Hip-Hop': ['hip hop', 'rap', 'boom bap', 'hip-hop', 'instrumental hip hop', 'southern rap'],
  'Around the World': ['city pop', 'afrobeat', 'samba', 'highlife', 'k-pop', 'j-pop', 'latin', 'world music'],
};
const appleGenres: [RegExp, string][] = [
  [/hip.hop|^rap$/i, 'Hip-Hop'],
  [/k.pop|j.pop|latin|world|indian|african|french pop|mandopop|cantopop|reggae|tropical/i, 'Around the World'],
  [/jazz|blues|r&b|soul|funk/i, 'Jazz & Soul'],
  [/electronic|dance|house|techno|trance/i, 'Electronic'],
  [/alternative|indie/i, 'Indie'],
  [/rock|metal|punk/i, 'Rock'],
  [/pop/i, 'Pop'],
];

function normalize(value: string) {
  return value.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, '');
}

function identity(song: Song) {
  const title = song.title.replace(/\s*\([^)]*\)|\s*\[[^\]]*\]|\s+-\s+.+$/g, (suffix, offset) =>
    offset > 0 && /remaster|\bversion\b|\bedit\b|deluxe|anniversary|radio mix|feat\.|with lyrics/i.test(suffix) ? '' : suffix);
  return normalize(song.artist) + ':' + normalize(title);
}

const artistGenre = new Map(discoveryTracks.map(song => [normalize(song.artist), song.group]));

type DiscoveryPool = {
  songs: Song[];
  identities: Set<string>;
  ids: Set<Song['id']>;
  tried: Set<string>;
  retryAt: number;
  request?: Promise<void>;
};

export class DiscoverySource {
  private pools = new Map<string, DiscoveryPool>();

  private getPool(kind: Kind, group: string) {
    const key = kind + ':' + group;
    let pool = this.pools.get(key);
    if (!pool) {
      const deduped = new Map<string, Song>();
      for (const song of discoveryPool(kind, group)) {
        const key = identity(song);
        if (!deduped.has(key)) deduped.set(key, song);
      }
      const songs = [...deduped.values()];
      pool = { songs, identities: new Set(deduped.keys()), ids: new Set(songs.map(song => song.id)),
        tried: new Set(), retryAt: 0 };
      this.pools.set(key, pool);
    }
    return pool;
  }

  songs(kind: Kind, group: string) {
    return this.getPool(kind, group).songs;
  }

  extend(kind: Kind, group: string) {
    const pool = this.getPool(kind, group);
    if (pool.request) return pool.request;
    if (pool.retryAt > Date.now()) return Promise.resolve();
    pool.request = this.fetchMore(pool, kind, group).finally(() => { pool.request = undefined; });
    return pool.request;
  }

  private async fetchMore(pool: DiscoveryPool, kind: Kind, group: string) {
    const artists = [...new Set(pool.songs.map(song => song.artist))];
    const words = [...new Set(pool.songs.flatMap(song => song.title.match(/[\p{L}]{3,}/gu) ?? []))];
    const styles = group === allGenres ? Object.values(genreTerms).flat() : genreTerms[group] ?? [];
    const country = Math.random() < .5 ? storefronts[0] : shuffled(storefronts)[0];
    const queryKey = (term: string) => country + ':' + term.toLowerCase();
    const artistQueries = shuffled(artists).filter(term => !pool.tried.has(queryKey(term)));
    const explorationQueries = shuffled([...new Set([...styles, ...words])])
      .filter(term => !pool.tried.has(queryKey(term)));
    const queries = Math.random() < .7 ? [artistQueries, explorationQueries] : [explorationQueries, artistQueries];

    const deadline = AbortSignal.timeout(25000);
    for (let attempt = 0; attempt < 3 && !deadline.aborted; attempt++) {
      const term = queries[attempt % 2].shift() ?? queries[1 - attempt % 2].shift();
      if (!term) break;
      const key = queryKey(term);
      if (pool.tried.has(key)) continue;
      pool.tried.add(key);
      const signal = AbortSignal.any([deadline, AbortSignal.timeout(12000)]);
      try {
        const matches = await searchApple(term, kind, signal, country);
        const additions: Song[] = [];
        for (const song of matches) {
          const classified = artistGenre.get(normalize(song.artist)) ??
            appleGenres.find(([pattern]) => pattern.test(song.genre))?.[1];
          if (group !== allGenres && classified !== group) continue;
          const key = identity(song);
          if (pool.identities.has(key) || pool.ids.has(song.id)) continue;
          pool.identities.add(key);
          pool.ids.add(song.id);
          additions.push({ ...song, group: classified });
        }
        if (additions.length) {
          pool.songs = [...pool.songs, ...additions];
          return;
        }
      } catch {
        pool.tried.delete(key);
      }
    }
    pool.retryAt = Date.now() + 10000;
  }
}

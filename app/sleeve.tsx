'use client';

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { ArrowRight, ArrowUpRight, Check, Disc3, Download, Heart, Library, Minus, Moon, Plus, Search,
  Shuffle, Star, Sun, Trash2, Upload, X } from 'lucide-react';
import { albumFor, chartAlbums, discoveryPool, discoveryTracks, drawDiscovery, genres, loadSpotifyLink, searchApple, spotifySearch, type Kind, type Song } from '../lib/catalogue';
import { DiscoverySource } from '../lib/discovery-source';
import { backup, csv, mergeRatings, parseBackup, songKey, STORAGE_KEY, type Rating } from '../lib/local-library';

const themeKey = 'sleeve.theme';
const views = ['discover', 'random', 'collection'] as const;
type View = typeof views[number];
type Filter = 'all' | Kind;
type DiscoveryRound = ReturnType<typeof drawDiscovery> & { pending?: boolean; unavailable?: boolean };
const featured = discoveryTracks.find(song => song.artist === 'Daft Punk' && song.title === 'One More Time') || discoveryTracks[0];

function readCollection() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? parseBackup(raw) : [];
}

function artworkTitle(song: Song) {
  return (song.album || song.title) + ' cover';
}

function Artwork({ song, eager = false }: { song: Song; eager?: boolean }) {
  return <div className="artwork">
    <Disc3 aria-hidden="true" />
    {song.art && <img key={song.art} src={song.art} alt={artworkTitle(song)} loading={eager ? 'eager' : 'lazy'}
      onError={event => { event.currentTarget.hidden = true; }} />}
  </div>;
}

function KindSwitch({ value, onChange, includeAll = false }: {
  value: Filter; onChange: (kind: Filter) => void; includeAll?: boolean;
}) {
  const choices: [Filter, string][] = [['track', 'Songs'], ['album', 'Albums']];
  if (includeAll) choices.unshift(['all', 'All']);
  return <div className="segments" aria-label="Music type">
    {choices.map(([key, label]) => <button key={key} type="button" aria-pressed={value === key}
      onClick={() => onChange(key)}>{label}</button>)}
  </div>;
}

function formatDuration(milliseconds: number) {
  const seconds = Math.round(milliseconds / 1000);
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}

function RatingScale({ score, onChange }: { score: number; onChange: (value: number) => void }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const display = hovered ?? score;
  const description = display >= 9 ? 'All-time favourite' : display >= 8 ? 'On repeat' :
    display >= 7 ? 'Really good' : display >= 5 ? 'Has its moments' : display >= 3 ? 'Not for me' : 'A skip';
  const hue = Math.round(8 + display * 13);
  const adjust = (step: number) => onChange(Math.max(0, Math.min(10, Math.round((score + step) * 10) / 10)));
  return <div className="rating-scale" style={{ '--score-hue': hue } as CSSProperties}>
    <div className="score-readout">
      <output htmlFor="rating-range" aria-label="Rating preview"><b>{display.toFixed(1)}</b><span>/ 10</span></output>
      <strong>{description}</strong>
    </div>
    <div className="score-steps" aria-label="Quick scores" onPointerLeave={() => setHovered(null)}>
      {Array.from({ length: 11 }, (_, value) => <button key={value} type="button"
        className={value <= display ? 'filled' : ''} aria-label={'Rate ' + value + ' out of 10'}
        aria-pressed={score === value} onPointerEnter={event => { if (event.pointerType === 'mouse') setHovered(value); }}
        onClick={() => { onChange(value); setHovered(null); }}>{value}</button>)}
    </div>
    <div className="fine-score">
      <button type="button" className="icon-button" aria-label="Decrease rating by 0.1" onClick={() => adjust(-0.1)}><Minus size={16}/></button>
      <input id="rating-range" type="range" aria-label="Fine-tune rating" min={0} max={10} step={0.1}
        value={score} onChange={event => onChange(Number(event.target.value))} />
      <button type="button" className="icon-button" aria-label="Increase rating by 0.1" onClick={() => adjust(0.1)}><Plus size={16}/></button>
    </div>
  </div>;
}

function sleeveEntry(dialog: HTMLDialogElement | null) {
  if (!dialog || dialog.open || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const rect = document.activeElement?.getBoundingClientRect();
  dialog.style.setProperty('--entry-x', rect ? (rect.left + rect.width / 2 - innerWidth / 2) + 'px' : '0px');
  dialog.style.setProperty('--entry-y', rect ? (rect.top + rect.height / 2 - innerHeight / 2) + 'px' : '20px');
  try {
    const audio = new AudioContext();
    const length = Math.floor(audio.sampleRate * .22);
    const buffer = audio.createBuffer(1, length, audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / length);
    const sound = audio.createBufferSource(), filter = audio.createBiquadFilter(), gain = audio.createGain();
    sound.buffer = buffer; filter.type = 'bandpass'; filter.frequency.setValueAtTime(500, audio.currentTime);
    filter.frequency.exponentialRampToValueAtTime(2200, audio.currentTime + .18);
    gain.gain.value = .035; sound.connect(filter).connect(gain).connect(audio.destination);
    sound.onended = () => { void audio.close(); }; sound.start();
  } catch {}
}

function useDiscovery(source: DiscoverySource, kind: Kind, group: string, count: number) {
  const [rounds, setRounds] = useState<Record<string, DiscoveryRound>>({});
  const key = kind + ':' + group;
  const current = rounds[key];

  useEffect(() => {
    if (current) return;
    void source.extend(kind, group);
    const initial = drawDiscovery(source.songs(kind, group), undefined, count);
    setRounds(previous => previous[key] ? previous : { ...previous, [key]: initial });
  }, [count, current, group, key, kind, source]);

  async function advance(nextGroup = group, append = false) {
    const nextKey = kind + ':' + nextGroup;
    const round = rounds[nextKey];
    if (round?.pending) return;
    const pool = source.songs(kind, nextGroup);
    const remaining = pool.length - (round?.seen.size ?? 0);
    const needsRefill = remaining < count;
    const shouldPrefetch = !round || round.seen.size <= count || remaining <= Math.max(count * 3, 14);
    if (needsRefill) {
      setRounds(previous => {
        const waiting = previous[nextKey] ?? { items: [], seen: new Set<string>() };
        return { ...previous, [nextKey]: { ...waiting, pending: true } };
      });
      await source.extend(kind, nextGroup);
    } else if (shouldPrefetch) {
      void source.extend(kind, nextGroup);
    }

    const available = source.songs(kind, nextGroup);
    setRounds(previous => {
      const previousRound = previous[nextKey];
      const next = drawDiscovery(available, previousRound, count, previous[key]?.items);
      if (!next.items.length && previousRound) {
        return { ...previous, [nextKey]: { ...previousRound, pending: false, unavailable: true } };
      }
      return { ...previous, [nextKey]: append && previousRound ? { ...next, items: [...previousRound.items, ...next.items] } : next };
    });
  }

  return { current, advance };
}

export default function Sleeve() {
  const [view, setView] = useState<View>('discover');
  const [dark, setDark] = useState(true);
  const [ready, setReady] = useState(false);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [sort, setSort] = useState('recent');
  const [collectionFilter, setCollectionFilter] = useState<Filter>('all');
  const [collectionQuery, setCollectionQuery] = useState('');
  const [onlyFavourites, setOnlyFavourites] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [toast, setToast] = useState('');
  const [undo, setUndo] = useState<Rating | null>(null);
  const [selected, setSelected] = useState<Song | null>(null);
  const [score, setScore] = useState(7.5);
  const [note, setNote] = useState('');
  const [favourite, setFavourite] = useState(false);
  const [genre, setGenre] = useState(genres[0]);
  const [randomGenre, setRandomGenre] = useState(genres[0]);
  const [kind, setKind] = useState<Kind>('track');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState({ term: '', revision: 0 });
  const [results, setResults] = useState<Song[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [chart, setChart] = useState<Song[]>([]);
  const [spotlightAlbums, setSpotlightAlbums] = useState<Song[]>([]);
  const [discovery] = useState(() => new DiscoverySource());
  const browse = useDiscovery(discovery, kind, genre, 28);
  const random = useDiscovery(discovery, 'track', randomGenre, 1);
  const spotifyLink = /^https?:\/\/open\.spotify\.com(?:\/|$)/i.test(query.trim());
  const [spotifyLoading, setSpotifyLoading] = useState(false);
  const [spotifyError, setSpotifyError] = useState('');
  const spotifyRequest = useRef<AbortController | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    function sync() {
      try {
        setRatings(readCollection());
        setStorageError('');
      } catch {
        setStorageError('Sleeve could not read your saved collection.');
      }
    }
    function onStorage(event: StorageEvent) {
      if (event.key === STORAGE_KEY || event.key === null) sync();
    }
    function onHash() {
      const hash = window.location.hash.slice(1) as View;
      setView(views.includes(hash) ? hash : 'discover');
    }
    sync();
    onHash();
    window.addEventListener('storage', onStorage);
    window.addEventListener('hashchange', onHash);
    try { setDark(localStorage.getItem(themeKey) !== 'light'); } catch {}
    setSpotlightAlbums(genres.slice(1).flatMap(group =>
      drawDiscovery(discoveryPool('album', group), undefined, 1).items).slice(0, 6));
    setReady(true);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('hashchange', onHash);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try { localStorage.setItem(themeKey, dark ? 'dark' : 'light'); } catch {}
  }, [dark, ready]);

  useEffect(() => {
    if (!search.term) {
      setLoading(false);
      setSearchError('');
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    let current = true;
    setLoading(true);
    setSearchError('');
    searchApple(search.term, kind, controller.signal)
      .then(items => { if (current) setResults(items); })
      .catch(() => { if (current) setSearchError('Apple Music search is unavailable right now. Try again in a moment.'); })
      .finally(() => { if (current) setLoading(false); window.clearTimeout(timeout); });
    return () => {
      current = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [search, kind]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (selected && dialog && !dialog.open) dialog.showModal();
    if (!selected && dialog?.open) dialog.close();
  }, [selected]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => { setToast(''); setUndo(null); }, undo ? 9000 : 3500);
    return () => window.clearTimeout(timeout);
  }, [toast, undo]);

  useEffect(() => {
    const controller = new AbortController();
    chartAlbums(controller.signal).then(setChart).catch(() => {});
    return () => controller.abort();
  }, []);

  function navigate(next: View) {
    if (view === next) return;
    spotifyRequest.current?.abort();
    setView(next);
    window.location.hash = next;
    window.scrollTo(0, 0);
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setSpotifyError('');
    if (spotifyLink) {
      void importSpotify(query.trim());
      return;
    }
    setSearch(previous => ({ term: query.trim(), revision: previous.revision + 1 }));
  }

  async function importSpotify(url: string) {
    spotifyRequest.current?.abort();
    const controller = new AbortController();
    spotifyRequest.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    setSpotifyError('');
    setSpotifyLoading(true);
    try {
      const song = await loadSpotifyLink(url, controller.signal);
      openRating(findRating(song)?.song || song);
      setQuery('');
      setSearch({ term: '', revision: 0 });
    } catch (error) {
      setSpotifyError(controller.signal.aborted ? 'Spotify took too long to respond.' :
        error instanceof Error ? error.message : 'Could not load that Spotify link.');
    } finally {
      window.clearTimeout(timeout);
      spotifyRequest.current = null;
      setSpotifyLoading(false);
    }
  }

  function roll(group = randomGenre) {
    void random.advance(group);
    setRandomGenre(group);
  }

  function findRating(song: Song) {
    return ratings.find(rating => songKey(rating.song) === songKey(song));
  }

  function openRating(song: Song) {
    sleeveEntry(dialogRef.current);
    const rating = findRating(song);
    setScore(rating?.score ?? 7.5);
    setNote(rating?.note ?? '');
    setFavourite(rating?.favourite ?? false);
    setSelected(song);
  }

  function updateCollection(update: (previous: Rating[]) => Rating[]) {
    try {
      const next = update(readCollection());
      localStorage.setItem(STORAGE_KEY, backup(next));
      setRatings(next);
      setStorageError('');
      return true;
    } catch {
      setToast('Could not update the collection in this browser.');
      return false;
    }
  }

  function saveRating(event: FormEvent) {
    event.preventDefault();
    if (!selected || !ready) return;
    const rating: Rating = { trackId: selected.id, song: selected, score, note, favourite, updatedAt: new Date().toISOString() };
    if (updateCollection(previous => mergeRatings(previous, [rating]))) {
      setSelected(null);
      setUndo(null);
      setToast('Saved to your collection.');
    }
  }

  function removeRating(song: Song) {
    const removed = findRating(song);
    if (removed && updateCollection(previous => previous.filter(rating => songKey(rating.song) !== songKey(song)))) {
      setUndo(removed);
      setSelected(null);
      setToast('Rating removed.');
    }
  }

  function download(format: 'json' | 'csv') {
    const data = format === 'json' ? backup(ratings) : csv(ratings);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([data], { type: format === 'json' ? 'application/json' : 'text/csv;charset=utf-8' }));
    link.download = 'sleeve-' + new Date().toISOString().slice(0, 10) + '.' + format;
    link.click();
    const url = link.href;
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 12_000_000) throw new Error('Choose a backup smaller than 12 MB.');
      const incoming = parseBackup(await file.text());
      if (updateCollection(previous => mergeRatings(previous, incoming))) {
        setToast('Backup imported.');
        navigate('collection');
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not import this backup.');
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  }

  const albumShelf = chart.length ? chart : spotlightAlbums;
  const displayed = search.term ? results : browse.current?.items ?? [];
  const randomSong = random.current?.items[0];
  const collection = ratings.filter(rating =>
    (collectionFilter === 'all' || (rating.song.kind || 'track') === collectionFilter) &&
    (!onlyFavourites || rating.favourite) &&
    [rating.song.title, rating.song.artist, rating.song.album, rating.note].join(' ').toLowerCase().includes(collectionQuery.trim().toLowerCase())
  ).sort((a, b) => {
    if (sort === 'highest') return b.score - a.score;
    if (sort === 'lowest') return a.score - b.score;
    if (sort === 'title') return a.song.title.localeCompare(b.song.title);
    if (sort === 'artist') return a.song.artist.localeCompare(b.song.artist);
    return b.updatedAt.localeCompare(a.updatedAt);
  });
  const selectedAlbum = selected && selected.kind !== 'album' ? albumFor(selected) : undefined;
  const searching = Boolean(search.term);
  const trackCount = ratings.filter(rating => rating.song.kind !== 'album').length;

  return <div className="app-shell">
    <header className="topbar">
      <button className="brand" onClick={() => navigate('discover')}><span><Disc3 size={22}/></span>Sleeve</button>
      <nav aria-label="Main navigation">
        <button aria-current={view === 'discover' ? 'page' : undefined} onClick={() => navigate('discover')}><Disc3 size={17}/> <span>Discover</span></button>
        <button aria-current={view === 'random' ? 'page' : undefined} onClick={() => navigate('random')}><Shuffle size={17}/> <span>Random song</span></button>
        <button aria-current={view === 'collection' ? 'page' : undefined} onClick={() => navigate('collection')}><Library size={17}/> <span>My collection</span></button>
      </nav>
      <button className="icon-button theme" onClick={() => setDark(!dark)} aria-label={dark ? 'Use light theme' : 'Use dark theme'}>
        {dark ? <Sun size={19}/> : <Moon size={19}/>}
      </button>
    </header>

    <main>
      {storageError && <p className="status" role="alert">{storageError}</p>}
      {view === 'discover' && <>
        {!searching && <section className="hero">
          <div className="hero-copy">
            <h1>Good music.<br/>Your take.</h1>
            <p>Find your next favourite. Rate songs and albums, and keep a record of what you love.</p>
            <button className="primary" onClick={() => searchRef.current?.focus()}>Start rating <ArrowRight size={18}/></button>
          </div>
          {featured && <article className="hero-record">
            <button type="button" className="record-disc" onClick={() => openRating(featured)}
              aria-label={'Rate ' + featured.title + ' by ' + featured.artist}>
              <Artwork song={featured} eager />
            </button>
            <div className="record-info">
              <button className="record-label" onClick={() => openRating(featured)}>
                <span><b>{featured.title}</b><small>{featured.artist}</small></span><ArrowUpRight size={20}/>
              </button>
              <div className="quick-score" role="group" aria-label="Quick rating">
                {[2, 4, 6, 8, 10].map(value => <button key={value} type="button"
                  aria-label={`Rate ${featured.title} ${value} out of 10`}
                  onClick={() => { openRating(featured); setScore(value); }}>
                  <Star size={18} fill={(findRating(featured)?.score ?? 0) >= value ? 'currentColor' : 'none'}/>
                </button>)}
              </div>
            </div>
          </article>}
        </section>}

        <section className="find-section" aria-label="Find music">
          <form className="search-bar" onSubmit={submitSearch}>
            <div className="query-field">
              <Search size={20}/>
              <input ref={searchRef} aria-label="Search songs, albums, or paste a Spotify link"
                placeholder="Search music or paste a Spotify link" value={query} maxLength={500}
                onChange={event => { setQuery(event.target.value); setSpotifyError(''); }}/>
              {query && <button className="icon-button clear-search" type="button" aria-label="Clear search"
                onClick={() => { setQuery(''); setSpotifyError(''); setSearch({ term: '', revision: 0 }); searchRef.current?.focus(); }}><X size={18}/></button>}
            </div>
            <KindSwitch value={kind} onChange={value => setKind(value as Kind)}/>
            <div className="platforms">
              <button className="primary" disabled={spotifyLoading} type="submit">
                {spotifyLoading ? 'Loading…' : spotifyLink ? 'Rate Spotify link' : 'Search Apple Music'}
              </button>
              {!spotifyLink && <a className="spotify-button" href={spotifySearch(query.trim() || search.term)} target="_blank" rel="noreferrer">
                Spotify <ArrowUpRight size={15}/>
              </a>}
            </div>
          </form>
          {spotifyError && <p role="alert">{spotifyError}</p>}
        </section>

        {!searching && <section className="album-shelf" aria-labelledby="shelf-heading">
          <div className="section-heading"><h2 id="shelf-heading">{chart.length ? 'Trending albums' : 'Albums in the spotlight'}</h2>
            {chart.length > 0 && <small>Apple Music · US</small>}</div>
          <div className="shelf-grid">{albumShelf.map((album, index) =>
            <button className="shelf-card" key={songKey(album)} onClick={() => openRating(album)}>
              <Artwork song={album}/><span><b>{album.title}</b><small>{album.artist}</small></span>
              {chart.length > 0 && <strong>#{index + 1}</strong>}
            </button>)}</div>
        </section>}

        <section className="results" aria-labelledby="discovery-results">
          <div className="section-heading">
            <h2 id="discovery-results">{searching ? 'Results for “' + search.term + '”' : kind === 'album' ? 'Albums to explore' : 'In rotation'}</h2>
            {!searching && <button className="secondary" disabled={browse.current?.pending} onClick={() => void browse.advance()}>
              <Shuffle size={16}/> {browse.current?.pending ? 'Finding more…' : 'Shuffle picks'}
            </button>}
          </div>
          {!searching && <div className="genre-list" aria-label="Filter featured music by genre">
            {genres.map(item => <button key={item} aria-pressed={genre === item} onClick={() => setGenre(item)}>{item}</button>)}
          </div>}
          {!searching && browse.current?.unavailable &&
            <p className="status" role="status">Couldn’t load more new picks. Try again in a moment.</p>}
          {searching && loading ? <p className="status" role="status">Searching Apple Music…</p> :
            searching && searchError ? <div className="status" role="alert">{searchError}
              <button className="secondary" onClick={() => setSearch(previous => ({ ...previous, revision: previous.revision + 1 }))}>Try again</button>
            </div> :
            displayed.length === 0 ? <p className="status">No {kind === 'album' ? 'albums' : 'songs'} found. Try a different title or artist.</p> :
            <div className="music-grid">
              {displayed.map(song => {
                const rating = findRating(song);
                return <button className="music-card" key={songKey(song)} onClick={() => openRating(song)}>
                  <div className="card-media"><Artwork song={song}/><span className="card-rating">
                    {rating ? rating.score.toFixed(1) : <Plus size={20}/>}
                  </span></div>
                  <b>{song.title}</b><span>{song.artist}</span>
                </button>;
              })}
            </div>}
          {!searching && displayed.length > 0 && <div className="feed-more"><button className="secondary" disabled={browse.current?.pending} onClick={() => void browse.advance(genre, true)}>{browse.current?.pending ? "Finding more…" : "Load more music"}</button></div>}
        </section>
      </>}

      {view === 'random' && <section className="random-page">
        <div className="page-heading">
          <h1>Random song</h1>
          <div className="random-controls">
            <select aria-label="Random song genre" value={randomGenre} onChange={event => roll(event.target.value)}>
              {genres.map(item => <option key={item}>{item}</option>)}
            </select>
            <button className="primary" disabled={random.current?.pending} onClick={() => roll()}>
              <Shuffle size={18}/> {random.current?.pending ? 'Finding more…' : 'Roll another'}
            </button>
          </div>
        </div>
        {random.current?.unavailable && <p className="status" role="status">Couldn’t load a new song. Try again in a moment.</p>}
        {randomSong && <article className="random-card" key={songKey(randomSong)}>
          <Artwork song={randomSong} eager/>
          <div className="random-details" aria-live="polite">
            <h2>{randomSong.title}</h2>
            <dl>
              <div><dt>Artist</dt><dd>{randomSong.artist}</dd></div>
              <div><dt>Album</dt><dd>{randomSong.album || '—'}</dd></div>
              <div><dt>Genre</dt><dd>{randomSong.genre || randomSong.group || '—'}</dd></div>
              <div><dt>Release year</dt><dd>{randomSong.year || '—'}</dd></div>
              <div><dt>Duration</dt><dd>{randomSong.duration ? formatDuration(randomSong.duration) : '—'}</dd></div>
            </dl>
            <div className="actions">
              <button className="primary" onClick={() => openRating(randomSong)}>Rate song <Plus size={18}/></button>
              {randomSong.url && <a className="secondary" href={randomSong.url} target="_blank" rel="noreferrer">Apple Music <ArrowUpRight size={16}/></a>}
              <a className="spotify-button" href={spotifySearch(randomSong.title + ' ' + randomSong.artist)} target="_blank" rel="noreferrer">
                Spotify <ArrowUpRight size={16}/>
              </a>
            </div>
          </div>
        </article>}
      </section>}

      {view === 'collection' && <section className="collection-page">
        <div className="page-heading">
          <h1>My collection</h1>
          <div className="actions">
            <button className="secondary" onClick={() => download('json')}><Download size={16}/> Export backup</button>
            <button className="secondary" onClick={() => download('csv')}><Download size={16}/> Export CSV</button>
            <button className="secondary" onClick={() => importRef.current?.click()}><Upload size={16}/> Import backup</button>
            <input ref={importRef} type="file" accept=".json,application/json" hidden onChange={event => importFile(event.target.files?.[0])}/>
          </div>
        </div>
        <div className="collection-stats">
          <div><b>{trackCount}</b><span>Songs rated</span></div>
          <div><b>{ratings.length - trackCount}</b><span>Albums rated</span></div>
          <div><b>{ratings.length ? (ratings.reduce((sum, rating) => sum + rating.score, 0) / ratings.length).toFixed(1) : '—'}</b><span>Average rating</span></div>
        </div>
        <div className="collection-controls">
          <KindSwitch includeAll value={collectionFilter} onChange={setCollectionFilter}/>
          <input type="search" placeholder="Search collection" aria-label="Search collection" value={collectionQuery} onChange={event => setCollectionQuery(event.target.value)}/>
          <select aria-label="Sort collection" value={sort} onChange={event => setSort(event.target.value)}>
            <option value="recent">Recently rated</option><option value="highest">Highest rated</option>
            <option value="lowest">Lowest rated</option><option value="title">Title A–Z</option><option value="artist">Artist A–Z</option>
          </select>
          <button className="secondary" aria-pressed={onlyFavourites} onClick={() => setOnlyFavourites(!onlyFavourites)}>
            <Heart size={16} fill={onlyFavourites ? 'currentColor' : 'none'}/> Favourites
          </button>
        </div>
        {collection.length ? <div className="rating-list">
          {collection.map(rating => <button key={songKey(rating.song)} className="rating-row" onClick={() => openRating(rating.song)}>
            <Artwork song={rating.song}/>
            <span><b>{rating.song.title}</b><small>{rating.song.artist && rating.song.artist + ' · '}{rating.song.kind === 'album' ? 'Album' : 'Song'}</small>
              {rating.note && <small className="review-note">{rating.note}</small>}</span>
            {rating.favourite && <Heart size={17} fill="currentColor" aria-label="Favourite"/>}
            <strong>{rating.score.toFixed(1)}<small>/10</small></strong>
          </button>)}
        </div> : <div className="status">
          <p>{ratings.length ? 'No ratings match those filters.' : 'Rate a song or album to start your collection.'}</p>
          {!ratings.length && <button className="secondary" onClick={() => navigate('discover')}>Discover music <ArrowRight size={17}/></button>}
        </div>}
        <p className="collection-footer">Your collection is stored on this device.</p>
      </section>}
    </main>

    <dialog ref={dialogRef} aria-labelledby="rating-title" onCancel={() => setSelected(null)}
      onClick={event => { if (event.target === event.currentTarget) setSelected(null); }}>
      {selected && <form className="rating-dialog" onSubmit={saveRating}>
        <button type="button" className="icon-button close-dialog" aria-label="Close rating" onClick={() => setSelected(null)}><X size={22}/></button>
        <div className="dialog-song"><Artwork song={selected} eager/><div>
          <span className="type-label">{selected.kind === 'album' ? 'Album rating' : 'Song rating'}</span>
          <h2 id="rating-title">{selected.title}</h2>
          <p>{selected.artist}{selected.kind !== 'album' && selected.album ? ' · ' + selected.album : ''}</p>
        </div></div>
        <div className="dialog-links">
          {selected.url && <a href={selected.url} target="_blank" rel="noreferrer">{selected.source === 'spotify' ? 'Spotify' : 'Apple Music'} <ArrowUpRight size={14}/></a>}
          {selected.source !== 'spotify' && <a href={spotifySearch(selected.title + ' ' + selected.artist)} target="_blank" rel="noreferrer">Spotify <ArrowUpRight size={14}/></a>}
          {selectedAlbum && <button type="button" onClick={() => openRating(selectedAlbum)}>Rate the album <ArrowRight size={14}/></button>}
        </div>
        {selected.source === 'spotify' && <label className="spotify-artist">
          <span>Artist <small>Optional</small></span>
          <input value={selected.artist} maxLength={250} onChange={event => setSelected({ ...selected, artist: event.target.value })}/>
        </label>}
        <RatingScale key={songKey(selected)} score={score} onChange={setScore}/>
        <label className="note-label" htmlFor="rating-note">Listening notes <span>Optional</span></label>
        <textarea id="rating-note" value={note} maxLength={1000} placeholder="What stood out to you?" onChange={event => setNote(event.target.value)}/>
        <div className="dialog-actions">
          {findRating(selected) && <button className="icon-button" type="button" aria-label="Delete rating" onClick={() => removeRating(selected)}><Trash2 size={19}/></button>}
          <button type="button" className="icon-button" aria-label="Favourite" aria-pressed={favourite}
            onClick={() => setFavourite(!favourite)}><Heart size={19} fill={favourite ? 'currentColor' : 'none'}/></button>
          <button className="primary" type="submit" disabled={!ready}>Save rating <Check size={18}/></button>
        </div>
      </form>}
    </dialog>
    {toast && <div className="toast" role="status">{toast}{undo && <button type="button" onClick={() => {
      if (updateCollection(previous => mergeRatings(previous, [undo]))) { setUndo(null); setToast('Rating restored.'); }
    }}>Undo</button>}</div>}
  </div>;
}

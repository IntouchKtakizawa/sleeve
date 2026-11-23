'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, Disc3, EyeOff, Headphones, Plus, RefreshCw, Upload } from 'lucide-react';
import { searchApple, type Song } from '../lib/catalogue';
import type { Rating } from '../lib/local-library';
import { DISMISSED_KEY, fetchLastfm, LASTFM_API_KEY, LASTFM_USER_KEY, matchPlay, mergePlays, parseSpotifyHistory,
  playKey, PLAYS_KEY, storedPlays, type Play } from '../lib/listening';

// Optional: set VITE_LASTFM_API_KEY at build time so people only need their username.
const BUILT_IN_KEY: string = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_LASTFM_API_KEY || '';

function read(key: string) { try { return localStorage.getItem(key) || ''; } catch { return ''; } }
function write(key: string, value: string) { try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); } catch {} }

function ago(iso: string) {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (minutes < 2) return 'just now';
  if (minutes < 60) return minutes + ' min ago';
  if (minutes < 1440) return Math.round(minutes / 60) + ' h ago';
  const days = Math.round(minutes / 1440);
  return days < 31 ? days + ' d ago' : new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function ListeningRoom({ ratings, onRate, onSearch, toast }: {
  ratings: Rating[]; onRate: (song: Song) => void; onSearch: (query: string) => void; toast: (message: string) => void;
}) {
  // This view only mounts in the browser, so saved settings can be read up front.
  const [user, setUser] = useState(() => read(LASTFM_USER_KEY));
  const [apiKey, setApiKey] = useState(() => read(LASTFM_API_KEY));
  const [plays, setPlays] = useState<Play[]>(() => storedPlays(read(PLAYS_KEY)));
  const [dismissed, setDismissed] = useState<string[]>(() => {
    try { const value = JSON.parse(read(DISMISSED_KEY) || '[]'); return Array.isArray(value) ? value.filter(v => typeof v === 'string') : []; }
    catch { return []; }
  });
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState('');
  const [show, setShow] = useState<'unrated' | 'all'>('unrated');
  const [order, setOrder] = useState<'recent' | 'most'>('recent');
  const [matching, setMatching] = useState('');
  const [limit, setLimit] = useState(40);
  const fileRef = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    // Pull the latest Last.fm plays each time the page opens.
    if (user && (apiKey || BUILT_IN_KEY)) void refresh(user, apiKey);
    return () => request.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function savePlays(next: Play[]) {
    const trimmed = next.slice(0, 5000);
    setPlays(trimmed); write(PLAYS_KEY, JSON.stringify(trimmed));
  }

  async function refresh(name = user, key = apiKey) {
    const token = key.trim() || BUILT_IN_KEY;
    if (!name.trim() || !token) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setStatus('loading'); setError('');
    try {
      const recent = await fetchLastfm(name, token, controller.signal);
      // Recent Last.fm plays replace older Last.fm counts for the same song, imported history is kept.
      setPlays(previous => {
        const next = mergePlays(previous.filter(p => !recent.some(r => r.key === p.key)), recent).slice(0, 5000);
        write(PLAYS_KEY, JSON.stringify(next));
        return next;
      });
      setStatus('idle');
    } catch (reason) {
      if (controller.signal.aborted) return;
      setStatus('error');
      setError(reason instanceof Error ? reason.message : 'Could not load your Last.fm plays.');
    }
  }

  function connect(event: FormEvent) {
    event.preventDefault();
    write(LASTFM_USER_KEY, user.trim()); write(LASTFM_API_KEY, apiKey.trim());
    void refresh();
  }

  function disconnect() {
    write(LASTFM_USER_KEY, ''); setUser('');
    savePlays([]); toast('Listening history cleared from this device.');
  }

  async function importFiles(files: FileList | null) {
    if (!files?.length) return;
    try {
      const lists: Play[][] = [];
      for (const file of files) {
        if (file.size > 60_000_000) throw new Error(file.name + ' is too large.');
        lists.push(parseSpotifyHistory(await file.text()));
      }
      const imported = mergePlays(...lists);
      savePlays(mergePlays(plays, imported));
      setOrder('most');
      toast('Imported ' + imported.length + ' songs from your Spotify history.');
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'Could not read that file.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function rate(play: Play) {
    setMatching(play.key);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const song = await matchPlay(play, (q, signal) => searchApple(q, 'track', signal), controller.signal);
      if (song) onRate(song);
      else { toast('Couldn’t match “' + play.title + '” automatically — pick it from search.'); onSearch(play.title + ' ' + play.artist); }
    } catch {
      toast('Apple Music search is unavailable right now. Try again in a moment.');
    } finally {
      clearTimeout(timer); setMatching('');
    }
  }

  function hide(play: Play) {
    const next = [...new Set([...dismissed, play.key])].slice(-3000);
    setDismissed(next); write(DISMISSED_KEY, JSON.stringify(next));
  }

  const rated = useMemo(() => new Map(ratings.filter(r => r.song.kind !== 'album').map(r => [playKey(r.song.artist, r.song.title), r])), [ratings]);
  const hidden = useMemo(() => new Set(dismissed), [dismissed]);
  const list = plays
    .filter(p => show === 'all' || (!rated.has(p.key) && !hidden.has(p.key)))
    .sort((a, b) => order === 'most' ? b.plays - a.plays || b.playedAt.localeCompare(a.playedAt) : b.playedAt.localeCompare(a.playedAt));
  const unratedCount = plays.filter(p => !rated.has(p.key) && !hidden.has(p.key)).length;
  const connected = Boolean(read(LASTFM_USER_KEY));
  const needsKey = !BUILT_IN_KEY;

  return <section className="listening-page">
    <div className="page-heading">
      <div><p className="eyebrow">YOUR LISTENING · RATE WHAT YOU PLAY</p><h1>Fresh off the turntable.</h1>
        <p className="lede">Bring in what you’ve actually been listening to on Spotify, Apple Music or anywhere else, then rate it in a tap.</p></div>
      {connected && <button className="secondary" disabled={status === 'loading'} onClick={() => void refresh()}>
        <RefreshCw size={16} className={status === 'loading' ? 'spin' : ''}/> {status === 'loading' ? 'Updating…' : 'Update plays'}</button>}
    </div>

    <div className="source-grid">
      <form className="source-card" onSubmit={connect}>
        <div className="source-title"><Headphones size={20}/><b>Last.fm</b><small>Spotify, Apple Music and more · updates automatically</small></div>
        <label><span>Last.fm username</span><input value={user} onChange={e => setUser(e.target.value)} placeholder="your-username" autoComplete="username" maxLength={64}/></label>
        {needsKey && <label><span>Last.fm API key</span><input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="32-character key" maxLength={64} spellCheck={false}/></label>}
        <div className="actions">
          <button className="primary" type="submit" disabled={!user.trim() || (needsKey && !apiKey.trim()) || status === 'loading'}>{connected ? 'Save' : 'Connect'}</button>
          {connected && <button className="secondary" type="button" onClick={disconnect}>Disconnect</button>}
        </div>
        <details><summary>How do I set this up?</summary><ol>
          <li>Make a free account at <a href="https://www.last.fm/join" target="_blank" rel="noreferrer">last.fm <ArrowUpRight size={12}/></a>.</li>
          <li>Spotify: in Last.fm <a href="https://www.last.fm/settings/applications" target="_blank" rel="noreferrer">Settings → Applications <ArrowUpRight size={12}/></a>, connect Spotify scrobbling.</li>
          <li>Apple Music: install a Last.fm scrobbler app for your iPhone or Mac.</li>
          {needsKey && <li>Get a free API key at <a href="https://www.last.fm/api/account/create" target="_blank" rel="noreferrer">last.fm/api <ArrowUpRight size={12}/></a> and paste it above. It stays on this device.</li>}
        </ol></details>
        {status === 'error' && <p className="form-error" role="alert">{error}</p>}
      </form>

      <div className="source-card">
        <div className="source-title"><Upload size={20}/><b>Spotify history file</b><small>Your full history · no account needed</small></div>
        <p>Request <em>Account data</em> or <em>Extended streaming history</em> from <a href="https://www.spotify.com/account/privacy/" target="_blank" rel="noreferrer">Spotify privacy settings <ArrowUpRight size={12}/></a>. When the email arrives, choose the <code>StreamingHistory</code> JSON files here.</p>
        <button className="secondary" onClick={() => fileRef.current?.click()}><Upload size={16}/> Choose history files</button>
        <input ref={fileRef} type="file" accept=".json,application/json" multiple hidden onChange={e => void importFiles(e.target.files)}/>
        <small className="muted">Read on this device only. Nothing is uploaded.</small>
      </div>
    </div>

    {plays.length > 0 && <>
      <div className="section-heading">
        <h2>{show === 'unrated' ? unratedCount + ' waiting for a rating' : plays.length + ' songs played'}</h2>
        <div className="collection-controls compact">
          <div className="segments" aria-label="Show">
            <button aria-pressed={show === 'unrated'} onClick={() => setShow('unrated')}>To rate</button>
            <button aria-pressed={show === 'all'} onClick={() => setShow('all')}>Everything</button>
          </div>
          <select aria-label="Order plays" value={order} onChange={e => setOrder(e.target.value as 'recent' | 'most')}>
            <option value="recent">Most recent</option><option value="most">Most played</option>
          </select>
        </div>
      </div>
      {list.length ? <div className="play-list">{list.slice(0, limit).map(play => {
        const rating = rated.get(play.key);
        return <div className={'play-row' + (play.nowPlaying ? ' now' : '')} key={play.key}>
          <div className="artwork small">{play.image ? <img src={play.image} alt="" loading="lazy" onError={e => { e.currentTarget.hidden = true; }}/> : null}<Disc3 aria-hidden="true"/></div>
          <span className="play-text"><b>{play.title}</b><small>{play.artist}{play.album ? ' · ' + play.album : ''}</small></span>
          <span className="play-meta">{play.nowPlaying ? <em>Playing now</em> : ago(play.playedAt)}{play.plays > 1 && <small>{play.plays} plays</small>}</span>
          {rating ? <button className="score-pill" onClick={() => onRate(rating.song)}>{rating.score.toFixed(1)}</button> :
            <button className="primary rate-play" disabled={matching === play.key} onClick={() => void rate(play)}>
              {matching === play.key ? 'Finding…' : <>Rate <Plus size={16}/></>}</button>}
          {!rating && show === 'unrated' && <button className="icon-button" aria-label={'Hide ' + play.title} title="Not interested" onClick={() => hide(play)}><EyeOff size={16}/></button>}
        </div>;
      })}</div> : <p className="status">{show === 'unrated' ? 'You’ve rated everything you played. Nice work.' : 'No plays yet.'}</p>}
      {list.length > limit && <div className="feed-more"><button className="secondary" onClick={() => setLimit(limit + 40)}>Show more</button></div>}
    </>}
    {!plays.length && status !== 'loading' && <p className="status">Connect Last.fm or import a Spotify history file to see your plays here.</p>}
  </section>;
}

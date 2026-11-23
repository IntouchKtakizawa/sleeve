'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { Disc3, Download, Link2, Plus, Share2, Sparkles, Users } from 'lucide-react';
import type { Song } from '../lib/catalogue';
import type { Rating } from '../lib/local-library';
import { isNative, shareImage } from '../lib/native';
import { drawRecap } from '../lib/recap-card';
import { compare, decodeProfile, encodeProfile, inPeriod, periodLabel, profileFrom, ratingStreak, sharedKey,
  sharedSong, tasteLabel, type Comparison, type Period, type SharedProfile } from '../lib/taste';

const NAME_KEY = 'sleeve.profile.name.v1';

async function shareOrDownload(blob: Blob, filename: string) {
  if (isNative) return shareImage(filename, blob);
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'My Sleeve recap' }); return; }
    catch (error) { if ((error as Error).name === 'AbortError') return; }
  }
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob); link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

export function RecapPanel({ ratings, dark, toast }: { ratings: Rating[]; dark: boolean; toast: (message: string) => void }) {
  const [period, setPeriod] = useState<Period>('month');
  const [image, setImage] = useState<{ url: string; blob: Blob } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => () => { if (image) URL.revokeObjectURL(image.url); }, [image]);

  const selected = inPeriod(ratings, period);
  async function create() {
    setBusy(true);
    try {
      const blob = await drawRecap({ title: periodLabel(period), ratings: selected, streak: ratingStreak(ratings), label: tasteLabel(selected), dark });
      setImage({ url: URL.createObjectURL(blob), blob });
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not create the recap.');
    } finally { setBusy(false); }
  }

  return <div className="share-card recap-panel">
    <div className="source-title"><Sparkles size={20}/><b>Your recap card</b><small>A Wrapped you can make any day, sized for Stories</small></div>
    <div className="segments" aria-label="Recap period">
      {(['month', 'year', 'all'] as Period[]).map(p => <button key={p} aria-pressed={period === p} onClick={() => { setPeriod(p); setImage(null); }}>
        {p === 'month' ? 'This month' : p === 'year' ? 'This year' : 'All time'}</button>)}
    </div>
    <p className="muted">{selected.length} record{selected.length === 1 ? '' : 's'} rated · {tasteLabel(selected)}</p>
    {image ? <div className="recap-preview"><img src={image.url} alt={'Sleeve recap for ' + periodLabel(period)}/>
      <div className="actions"><button className="primary" onClick={() => void shareOrDownload(image.blob, 'sleeve-recap-' + period + '.png')}>
        <Share2 size={16}/> Share image</button>
        <button className="secondary" onClick={() => setImage(null)}>Change period</button></div></div> :
      <button className="primary" disabled={busy || !selected.length} onClick={() => void create()}>
        {busy ? 'Pressing your card…' : selected.length ? <><Download size={16}/> Create recap</> : 'Rate something first'}</button>}
  </div>;
}

export function ShareTaste({ ratings, toast }: { ratings: Rating[]; toast: (message: string) => void }) {
  const [name, setName] = useState(() => { try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; } });
  const [busy, setBusy] = useState(false);

  async function share() {
    setBusy(true);
    try { localStorage.setItem(NAME_KEY, name.trim()); } catch {}
    try {
      const code = await encodeProfile(profileFrom(ratings, name));
      const url = location.origin + location.pathname + '#compare=' + code;
      const text = (name.trim() || 'A friend') + ' shared their music taste on Sleeve. How well do you match?';
      if (navigator.share && (isNative || matchMedia('(pointer: coarse)').matches)) {
        try { await navigator.share({ title: 'Compare music taste', text, url }); return; }
        catch (error) { if ((error as Error).name === 'AbortError') return; }
      }
      await navigator.clipboard.writeText(url);
      toast('Taste link copied. Send it to a friend.');
    } catch {
      toast('Could not create the link in this browser.');
    } finally { setBusy(false); }
  }

  return <div className="share-card">
    <div className="source-title"><Users size={20}/><b>Compare taste with friends</b><small>No accounts — your top records travel inside the link</small></div>
    <label><span>Your name <small>Optional</small></span><input value={name} onChange={e => setName(e.target.value)} maxLength={40} placeholder="Shown to your friend"/></label>
    <button className="primary" disabled={busy || ratings.length < 3} onClick={() => void share()}>
      <Link2 size={16}/> {ratings.length < 3 ? 'Rate 3 records to share' : busy ? 'Creating link…' : 'Share my taste link'}</button>
    <small className="muted">Includes your 40 favourite and highest-rated records. Notes stay private.</small>
  </div>;
}

function Cover({ art }: { art?: string }) {
  return <div className="artwork small">{art && <img src={art} alt="" loading="lazy" onError={e => { e.currentTarget.hidden = true; }}/>}<Disc3 aria-hidden="true"/></div>;
}

export function CompareView({ code, ratings, onRate, onDone, toast }: {
  code: string; ratings: Rating[]; onRate: (song: Song) => void; onDone: () => void; toast: (message: string) => void;
}) {
  const [profile, setProfile] = useState<SharedProfile | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    // The parent keys this component by link, so a new link starts from a fresh state.
    let live = true;
    decodeProfile(code).then(p => { if (live) setProfile(p); }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [code]);

  if (error) return <section className="compare-page"><h1>Taste link</h1><p className="status" role="alert">{error}</p>
    <button className="secondary" onClick={onDone}>Go to Sleeve</button></section>;
  if (!profile) return <section className="compare-page"><p className="status">Reading taste link…</p></section>;

  const who = profile.n || 'Your friend';
  const result: Comparison = compare(ratings, profile);
  const verdict = result.match === null ? 'Rate some music to see your match' : result.match >= 80 ? 'Musical soulmates' :
    result.match >= 60 ? 'Strong overlap' : result.match >= 40 ? 'Some common ground' : 'Opposites attract';

  return <section className="compare-page">
    <p className="eyebrow">TASTE MATCH</p>
    <div className="match-hero">
      <div className="match-ring" style={{ '--match': (result.match ?? 0) + '%' } as CSSProperties}>
        <b>{result.match === null ? '—' : result.match + '%'}</b></div>
      <div><h1>You &amp; {who}</h1><p className="lede">{verdict}. {profile.items.length} of their top records,
        {' '}{result.shared.length} you’ve both rated{result.artistsInCommon.length ? ', ' + result.artistsInCommon.length + ' artists in common' : ''}.</p>
        <div className="actions"><ShareBack ratings={ratings} toast={toast}/>
          <button className="secondary" onClick={onDone}>Back to Sleeve</button></div></div>
    </div>

    {result.shared.length > 0 && <><h2>Rated by both of you</h2><div className="compare-list">
      {result.shared.map(({ item, mine }) => <button key={sharedKey(item)} className="compare-row" onClick={() => onRate(mine.song)}>
        <Cover art={item.art || mine.song.art}/><span><b>{item.t}</b><small>{item.r}</small></span>
        <span className="both-scores"><small>You</small><strong>{mine.score.toFixed(1)}</strong><small>{who}</small><strong>{item.s.toFixed(1)}</strong></span>
      </button>)}</div></>}

    {result.theirPicks.length > 0 && <><h2>{who}’s picks for you</h2><div className="music-grid">
      {result.theirPicks.map(item => <button className="music-card" key={sharedKey(item)} onClick={() => onRate(sharedSong(item))}>
        <div className="card-media"><div className="artwork">{item.art && <img src={item.art} alt="" loading="lazy"/>}<Disc3 aria-hidden="true"/></div>
          <span className="card-rating">{item.s.toFixed(1)}</span></div>
        <b>{item.t}</b><span>{item.r}{item.f ? ' · ♥' : ''}</span></button>)}</div>
      <p className="muted">Scores are {who}’s. Tap one to rate it yourself <Plus size={12}/></p></>}

    {result.artistsInCommon.length > 0 && <><h2>Artists you both love</h2>
      <div className="genre-list">{result.artistsInCommon.map(a => <span className="chip" key={a}>{a}</span>)}</div></>}
  </section>;
}

function ShareBack({ ratings, toast }: { ratings: Rating[]; toast: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  if (ratings.length < 3) return null;
  return <button className="primary" disabled={busy} onClick={async () => {
    setBusy(true);
    try {
      let name = ''; try { name = localStorage.getItem(NAME_KEY) || ''; } catch {}
      const url = location.origin + location.pathname + '#compare=' + await encodeProfile(profileFrom(ratings, name));
      await navigator.clipboard.writeText(url); toast('Your taste link is copied. Send it back!');
    } catch { toast('Could not create the link in this browser.'); } finally { setBusy(false); }
  }}><Link2 size={16}/> Send yours back</button>;
}

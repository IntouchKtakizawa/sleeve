'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore,
  type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowUpRight, ChevronLeft, ChevronRight, Pause, RotateCw, Star } from 'lucide-react';
import type { Song } from '../../lib/catalogue';
import type { Rating } from '../../lib/local-library';
import { useCoverTint } from '../use-cover-tint';
import { fallbackInk, labelImage, Pressing } from './Pressing';
import { cinematicRate, RecordMotor } from './motor';
import { useRecordDrag } from './use-record-drag';

const autoAdvanceMs = 4800;
const motionQuery = '(prefers-reduced-motion: reduce)';
const wrap = (n: number, length: number) => ((n % length) + length) % length;

function watchMotion(onChange: () => void) {
  const query = matchMedia(motionQuery);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function watchVisibility(onChange: () => void) {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}

type Props = {
  tracks: Song[];
  children: ReactNode;
  dialogOpen: boolean;
  findRating: (song: Song) => Rating | undefined;
  onRate: (song: Song, initialScore?: number) => void;
};

export function RecordRotation({ tracks, children, dialogOpen, findRating, onRate }: Props) {
  const count = tracks.length;
  const [position, setPosition] = useState(() => ({
    current: Math.floor(Date.now() / 86400000) % Math.max(1, count),
    previous: null as number | null,
    manual: false,
  }));
  const [motion, setMotion] = useState<'default' | 'play' | 'pause'>('default');
  const [cinematic, setCinematic] = useState(false);
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const [onScreen, setOnScreen] = useState(true);
  const [motor] = useState(() => new RecordMotor());
  const stage = useRef<HTMLDivElement>(null);
  const reduced = useSyncExternalStore(watchMotion, () => matchMedia(motionQuery).matches, () => true);
  const visible = useSyncExternalStore(watchVisibility, () => !document.hidden, () => false);
  const paused = motion === 'pause' || (motion === 'default' && reduced);
  const running = !paused && onScreen && visible && !dialogOpen;
  const song = tracks[position.current];
  const tint = useCoverTint(labelImage(song?.art), fallbackInk(song));

  const move = useCallback((delta: number, manual = true) => {
    if (count < 2 || !delta) return;
    setPosition(old => ({ current: wrap(old.current + delta, count), previous: old.current, manual }));
  }, [count]);
  const drag = useRecordDrag(move);

  useLayoutEffect(() => {
    motor.setRate(running ? (cinematic ? cinematicRate : 1) : 0);
  }, [motor, running, cinematic]);

  useEffect(() => {
    const target = stage.current;
    if (!target || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting));
    observer.observe(target);
    return () => observer.disconnect();
  }, [count]);

  useEffect(() => {
    if (!running || keyboardFocus || drag.holding || count < 2) return;
    const timeout = window.setTimeout(() => move(1, false), autoAdvanceMs);
    return () => clearTimeout(timeout);
  }, [running, keyboardFocus, drag.holding, position.current, count, move]);

  function keyNavigation(event: KeyboardEvent<HTMLElement>) {
    if (event.altKey || event.metaKey || event.ctrlKey || !song) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      setKeyboardFocus(true);
      if (event.target instanceof Element && event.target.closest('.rr-hit')) stage.current?.focus();
      move(event.key === 'ArrowLeft' ? -1 : 1);
    } else if (event.target === stage.current && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      onRate(song);
    }
  }

  const previousSong = position.previous === null ? undefined : tracks[position.previous];
  // Two hidden positions on each end let a click skip two LPs in either direction
  // while all five visible pressings retain their identity through the wraparound.
  const windowSize = Math.min(count, 9);
  const offsets = Array.from({ length: windowSize }, (_, n) => n - Math.floor((windowSize - 1) / 2));

  return <section className="hero editorial-hero rr-hero" style={{ '--album-colour': 'rgb(' + tint + ')' } as CSSProperties}>
    {children}
    {song && <article className="rr-carousel" aria-label="Record rotation" aria-roledescription="carousel"
      onKeyDown={keyNavigation}
      onFocus={event => { if (event.target.matches(':focus-visible')) setKeyboardFocus(true); }}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setKeyboardFocus(false); }}>
      <div className="rr-stage" ref={stage} role="group" tabIndex={0} aria-keyshortcuts="ArrowLeft ArrowRight Enter"
        aria-label={'Featured record: ' + song.title + '. Use the arrow keys to browse or Enter to rate.'}
        {...drag.handlers}>
        <div className="rr-floor" aria-hidden="true" />
        <div className="rr-rack">
          {offsets.map(offset => {
            const trackIndex = wrap(position.current + offset, count);
            return <Pressing key={trackIndex} song={tracks[trackIndex]} trackIndex={trackIndex}
              offset={offset} motor={motor} select={() => offset ? move(offset) : onRate(song)} />;
          })}
        </div>
      </div>
      <div className="rr-desk">
        <div className="rr-controls" role="group" aria-label="Record rotation controls">
          <span className="rr-heading">Record rotation</span>
          <button className="rr-speed" type="button" aria-label="Cinematic rotation speed" aria-pressed={cinematic}
            title={cinematic ? 'Switch to 33⅓ RPM' : 'Switch to cinematic rotation (8 RPM)'}
            onClick={() => setCinematic(slow => !slow)}>{cinematic ? '8 RPM' : '33⅓ RPM'}</button>
          <div className="rr-transport">
            <button type="button" aria-label="Previous record" disabled={count < 2} onClick={() => move(-1)}><ChevronLeft /></button>
            <button type="button" aria-label={paused ? 'Resume record rotation' : 'Pause record rotation'}
              title={paused ? 'Resume record rotation' : 'Pause record rotation'}
              onClick={() => setMotion(paused ? 'play' : 'pause')}>{paused ? <RotateCw /> : <Pause />}</button>
            <button type="button" aria-label="Next record" disabled={count < 2} onClick={() => move(1)}><ChevronRight /></button>
          </div>
        </div>
        <div className="rr-info">
          <button className="rr-info-link" type="button" aria-label={'Rate ' + song.title + ' by ' + song.artist}
            title={song.title + ' — ' + song.artist} onClick={() => onRate(song)}>
            <span className="rr-captions" aria-hidden="true">
              {previousSong && <Caption key={position.previous} song={previousSong} outgoing />}
              <Caption key={position.current} song={song} />
            </span>
            <ArrowUpRight aria-hidden="true" />
          </button>
          <RatingStars song={song} score={findRating(song)?.score} onRate={onRate} />
        </div>
      </div>
      <span className="rr-sr-only" role="status" aria-atomic="true">
        {position.manual ? song.title + ' by ' + song.artist + ', record ' + (position.current + 1) + ' of ' + count : ''}
      </span>
    </article>}
  </section>;
}

function Caption({ song, outgoing = false }: { song: Song; outgoing?: boolean }) {
  return <span className={'rr-caption ' + (outgoing ? 'rr-outgoing' : 'rr-incoming')}>
    <strong>{song.title}</strong><span>{song.artist}</span>
  </span>;
}

function RatingStars({ song, score, onRate }: { song: Song; score?: number; onRate: Props['onRate'] }) {
  return <div className="rr-rating">
    <div className="rr-stars" role="group" aria-label={'Quick rating for ' + song.title}>
      {[2, 4, 6, 8, 10].map(value => {
        const fill = Math.max(0, Math.min(1, ((score ?? 0) - (value - 2)) / 2));
        return <button key={value} type="button" aria-label={'Rate ' + song.title + ' ' + value + ' out of 10'}
          style={{ '--star-fill': (fill * 100) + '%' } as CSSProperties} onClick={() => onRate(song, value)}>
          <span className="rr-star-icon"><Star /><span className="rr-star-fill"><Star /></span></span>
        </button>;
      })}
    </div>
    <span className="rr-score" data-unrated={score === undefined}>{score === undefined ? 'Rate record' : score.toFixed(1) + ' / 10'}</span>
  </div>;
}

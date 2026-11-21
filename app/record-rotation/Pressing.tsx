import { useEffect, useLayoutEffect, useRef, type CSSProperties, type PointerEvent } from 'react';
import type { Song } from '../../lib/catalogue';
import type { RecordMotor } from './motor';

const paperInks = ['168,128,103', '105,137,145', '149,122,145', '148,143,108', '123,137,111', '122,135,158'];

export function fallbackInk(song?: Song) {
  const name = song?.album || song?.artist || '';
  let hash = 0;
  for (const letter of name) hash = (Math.imul(31, hash) + letter.charCodeAt(0)) | 0;
  return paperInks[Math.abs(hash) % paperInks.length];
}

export function labelImage(art?: string) {
  // The paper label is about 100 CSS pixels wide, even on the largest LP.
  return art?.replace(/\/\d+x\d+bb\.(jpg|png)(?=$|\?)/, '/240x240bb.$1');
}

type Props = {
  song: Song;
  trackIndex: number;
  offset: number;
  motor: RecordMotor;
  select: () => void;
};

export function Pressing({ song, trackIndex, offset, motor, select }: Props) {
  const rotor = useRef<HTMLSpanElement>(null);
  const frame = useRef(0);
  const buffered = Math.abs(offset) > 2;

  useLayoutEffect(() => {
    if (rotor.current) return motor.attach(rotor.current, trackIndex);
  }, [motor, trackIndex]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  function tilt(event: PointerEvent<HTMLButtonElement>) {
    if (event.pointerType !== 'mouse' || event.buttons || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const { currentTarget: hit, clientX, clientY } = event;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      // Measure the navigation slot. Tilting its child never moves this hit target.
      const bounds = hit.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const x = Math.max(-1, Math.min(1, 2 * (clientX - bounds.left) / bounds.width - 1));
      const y = Math.max(-1, Math.min(1, 2 * (clientY - bounds.top) / bounds.height - 1));
      hit.style.setProperty('--aim-x', (4 * x).toFixed(2) + 'deg');
      hit.style.setProperty('--aim-y', (-3.5 * y).toFixed(2) + 'deg');
      hit.style.setProperty('--light-turn', (5 * x - 3 * y).toFixed(2) + 'deg');
    });
  }

  function settle(event: PointerEvent<HTMLButtonElement>) {
    cancelAnimationFrame(frame.current);
    for (const property of ['--aim-x', '--aim-y', '--light-turn']) event.currentTarget.style.removeProperty(property);
  }

  return <div className="rr-position" data-slot={offset} aria-hidden={buffered || undefined}>
    <button className="rr-hit" type="button" tabIndex={-1} disabled={buffered}
      aria-label={(offset === 0 ? 'Rate ' : 'Select ') + song.title + ' by ' + song.artist}
      onPointerMove={tilt} onPointerLeave={settle} onClick={select}>
      <span className="rr-interaction" aria-hidden="true">
        <span className="rr-face">
          <span className="rr-material" />
          <span className="rr-spin" ref={rotor}>
            <span className="rr-wear" />
            <span className="rr-label" style={{ '--paper-ink': 'rgb(' + fallbackInk(song) + ')' } as CSSProperties}>
              <span className="rr-letterpress">{song.artist}<small>{song.album || song.title}</small></span>
              {song.art && <img src={labelImage(song.art)} alt="" draggable={false}
                decoding="async" loading={buffered ? 'lazy' : 'eager'}
                onError={event => { event.currentTarget.hidden = true; }} />}
            </span>
          </span>
          <span className="rr-reflection" />
        </span>
        <span className="rr-hole" />
      </span>
    </button>
  </div>;
}

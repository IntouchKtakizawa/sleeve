// Draws a 1080×1920 story-sized recap image of your ratings — a Wrapped you can make any day.
import type { Rating } from './local-library';

export type RecapInput = {
  title: string;          // e.g. "November 2026"
  ratings: Rating[];      // ratings in the period
  streak: number;
  label: string;          // taste label
  dark: boolean;
};

const W = 1080, H = 1920;
const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

function loadImage(src: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';           // keeps the canvas exportable
    const timer = setTimeout(() => resolve(null), 6000);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = src.replace('600x600bb', '300x300bb');
  });
}

function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(out + '…').width > max) out = out.slice(0, -1);
  return out.trimEnd() + '…';
}

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawRecord(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, cover: HTMLImageElement | null, ink: string) {
  ctx.save();
  ctx.fillStyle = '#0a0a0a';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 2;
  for (let g = r * 0.42; g < r * 0.97; g += 9) { ctx.beginPath(); ctx.arc(cx, cy, g, 0, Math.PI * 2); ctx.stroke(); }
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.38, 0, Math.PI * 2); ctx.clip();
  if (cover) ctx.drawImage(cover, cx - r * 0.38, cy - r * 0.38, r * 0.76, r * 0.76);
  else { ctx.fillStyle = ink; ctx.fill(); }
  ctx.restore();
  ctx.fillStyle = '#0a0a0a';
  ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2); ctx.fill();
}

export async function drawRecap(input: RecapInput): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser can’t draw images.');
  const bg = input.dark ? '#111311' : '#f5f5ed', text = input.dark ? '#f6f4ed' : '#20241d';
  const muted = input.dark ? '#aeb5a9' : '#56604f', accent = '#d1f779', panel = input.dark ? '#1b1f1a' : '#e9ebe0';

  const top = [...input.ratings].sort((a, b) => b.score - a.score || b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);
  const covers = await Promise.all(top.map(r => loadImage(r.song.art)));
  if ('fonts' in document) await document.fonts.ready;

  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.85, 260, 40, W * 0.85, 260, 700);
  glow.addColorStop(0, 'rgba(209,247,121,.28)'); glow.addColorStop(1, 'rgba(209,247,121,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

  drawRecord(ctx, W - 150, 330, 300, covers[0], accent);

  ctx.fillStyle = muted; ctx.font = `600 30px ${FONT}`; ctx.letterSpacing = '6px';
  ctx.fillText('SLEEVE · ON THE RECORD', 80, 150);
  ctx.letterSpacing = '0px';
  // Shrink long titles ("September 2026") so they fit beside the record instead of being cut off.
  let size = 104;
  do { ctx.font = `800 ${size}px ${FONT}`; size -= 4; } while (size > 60 && ctx.measureText(input.title).width > 620);
  ctx.fillStyle = text;
  ctx.fillText(fit(ctx, input.title, 620), 80, 290);

  const avg = input.ratings.length ? input.ratings.reduce((s, r) => s + r.score, 0) / input.ratings.length : 0;
  const genres = new Map<string, number>();
  for (const r of input.ratings) if (r.song.genre) genres.set(r.song.genre, (genres.get(r.song.genre) || 0) + 1);
  const topGenre = [...genres].sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
  const stats: [string, string][] = [
    [String(input.ratings.length), 'records rated'], [input.ratings.length ? avg.toFixed(1) : '—', 'average score'],
    [input.streak ? input.streak + ' day' + (input.streak === 1 ? '' : 's') : '—', 'rating streak'], [topGenre, 'top genre'],
  ];
  stats.forEach(([value, label], index) => {
    const x = 80 + (index % 2) * 470, y = 400 + Math.floor(index / 2) * 190;
    ctx.fillStyle = panel; rounded(ctx, x, y, 440, 160, 28); ctx.fill();
    ctx.fillStyle = text; ctx.font = `800 64px ${FONT}`; ctx.fillText(fit(ctx, value, 380), x + 32, y + 86);
    ctx.fillStyle = muted; ctx.font = `500 30px ${FONT}`; ctx.fillText(label, x + 32, y + 130);
  });

  ctx.fillStyle = accent; rounded(ctx, 80, 800, 920, 96, 48); ctx.fill();
  ctx.fillStyle = '#151d0d'; ctx.font = `700 40px ${FONT}`; ctx.textAlign = 'center';
  ctx.fillText(input.label, W / 2, 862); ctx.textAlign = 'left';

  ctx.fillStyle = text; ctx.font = `800 52px ${FONT}`; ctx.fillText('Top rated', 80, 1000);
  if (!top.length) { ctx.fillStyle = muted; ctx.font = `500 36px ${FONT}`; ctx.fillText('Rate a few records to fill this in.', 80, 1080); }
  top.forEach((r, index) => {
    const y = 1040 + index * 150, cover = covers[index];
    ctx.fillStyle = muted; ctx.font = `700 36px ${FONT}`; ctx.fillText(String(index + 1), 80, y + 76);
    ctx.save(); rounded(ctx, 130, y, 120, 120, 16); ctx.clip();
    if (cover) ctx.drawImage(cover, 130, y, 120, 120); else { ctx.fillStyle = panel; ctx.fillRect(130, y, 120, 120); }
    ctx.restore();
    ctx.fillStyle = text; ctx.font = `700 40px ${FONT}`; ctx.fillText(fit(ctx, r.song.title, 560), 280, y + 52);
    ctx.fillStyle = muted; ctx.font = `500 32px ${FONT}`;
    ctx.fillText(fit(ctx, (r.song.artist || '') + (r.song.kind === 'album' ? ' · Album' : ''), 560), 280, y + 98);
    ctx.fillStyle = `hsl(${r.score * 12} 72% ${input.dark ? 62 : 40}%)`; ctx.font = `800 56px ${FONT}`; ctx.textAlign = 'right';
    ctx.fillText(r.score.toFixed(1), 1000, y + 80); ctx.textAlign = 'left';
  });

  ctx.fillStyle = muted; ctx.font = `500 30px ${FONT}`; ctx.textAlign = 'center';
  ctx.fillText('Rate your music · intouchktakizawa.github.io/sleeve', W / 2, H - 80);

  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not create the image.')), 'image/png'));
}

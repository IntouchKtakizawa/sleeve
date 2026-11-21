// Optional art regeneration: node scripts/render-pressing.mjs (requires cwebp).
// Only this rotationally symmetric surface response is baked. Handling marks
// and paper rotate independently in the browser, under the stationary softbox.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const size = 1024;
const pixels = Buffer.alloc(size * size * 3);
const tau = 2 * Math.PI;
const bands = [0.407, 0.491, 0.612, 0.704, 0.816, 0.902, 0.972];
const pitch = [408, 459, 387, 424, 462, 402];
const smooth = (from, to, value) => {
  const k = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return k * k * (3 - 2 * k);
};
const bell = n => Math.exp(-n * n);
const lobe = (angle, axis, width) => bell(2 * Math.sin((angle - axis) / 2) / width);
let seed = 210347;
function noise() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296 - 0.5;
}

for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const nx = (2 * x + 1) / size - 1;
    const ny = (2 * y + 1) / size - 1;
    const r = Math.hypot(nx, ny);
    const theta = Math.atan2(ny, nx);

    // A window-sized key above the left shoulder and a weaker fill opposite.
    const keyAxis = -2.32 + 0.14 * (r - 0.55);
    const key = lobe(theta, keyAxis, 0.48);
    const fill = lobe(theta, keyAxis + Math.PI, 0.61);
    const window = lobe(theta, keyAxis - 0.29, 0.14);
    const grazing = Math.max(0, 1 - (nx + 0.8 * ny) / 2);
    let light = 13 + 39 * key + 23 * fill + 11 * window + 2.8 * grazing;

    if (r >= bands[0] && r < bands.at(-1)) {
      let band = 0;
      while (r >= bands[band + 1]) band++;
      const d = r - bands[band];
      const phase = tau * (d * pitch[band] + 0.2 * Math.sin(62 * r) + 0.09 * Math.sin(173 * r));
      const wall = 0.73 * Math.sin(phase) + 0.27 * Math.sin(phase * 2 - 0.8);
      const modulation = Math.sin(113 * r + band) + 0.65 * Math.sin(349 * r);
      light += (2.5 + 10 * key + 5 * fill) * wall + (1.1 + 1.8 * key) * modulation;
      // The short ungrooved land between tracks catches a different reflection.
      light -= (8 + 8 * key) * bell(d / 0.0028);
      light += (3 + 5 * key) * bell((d - 0.0038) / 0.0015);
    } else if (r < bands[0]) {
      const spiral = 0.5 + 0.5 * Math.cos(tau * (r * 73));
      light = 9 + key * 33 + fill * 15 + smooth(0.33, 0.41, r) * (2 + 5 * key) * spiral ** 6;
      light += 13 * bell((r - 0.339) / 0.0025);
    } else {
      const bevel = bell((r - 0.985) / 0.004);
      light = 8 + (9 + 20 * key + 10 * fill) * bevel + 3 * grazing;
      light += (9 + 18 * Math.max(0, -ny)) * bell((r - 0.996) / 0.002);
    }
    light += noise() * 2.1;
    const shade = Math.max(0, 1 - smooth(0.998, 1.003, r));
    const at = (y * size + x) * 3;
    pixels[at] = Math.round((light * 0.99 + 1.0 * fill) * shade);
    pixels[at + 1] = Math.round(light * shade);
    pixels[at + 2] = Math.round((light * 1.023 + 1.6 * key) * shade);
  }
}

const destination = fileURLToPath(new URL('../app/record-rotation/pressing.webp', import.meta.url));
const ppm = Buffer.concat([Buffer.from('P6\n' + size + ' ' + size + '\n255\n'), pixels]);
const directory = mkdtempSync(join(tmpdir(), 'sleeve-pressing-'));
const source = join(directory, 'surface.ppm');
writeFileSync(source, ppm);
try {
  const result = spawnSync('cwebp', ['-quiet', '-q', '89', '-m', '6', source, '-o', destination]);
  if (result.status !== 0) throw result.error || new Error(result.stderr.toString());
} finally {
  unlinkSync(source);
  rmdirSync(directory);
}

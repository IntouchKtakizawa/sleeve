import { useEffect, useState } from 'react';

const measuredColours = new Map<string, string>();
const neutral = '110,125,115';

/** The rating dialog and the record display sample artwork the same way. */
export function useCoverTint(art?: string, fallback = neutral) {
  const [sample, setSample] = useState({ art: '', colour: '' });

  useEffect(() => {
    if (!art || measuredColours.has(art)) return;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 24;
        const context = canvas.getContext('2d');
        if (!context) return;
        context.drawImage(image, 0, 0, 24, 24);
        const { data } = context.getImageData(0, 0, 24, 24);
        const totals = [0, 0, 0];
        let weights = 0;
        for (let at = 0; at < data.length; at += 4) {
          const high = Math.max(data[at], data[at + 1], data[at + 2]);
          const low = Math.min(data[at], data[at + 1], data[at + 2]);
          const weight = (high - low + 15) * (high > 30 && high < 245 ? 1 : 0.15) * data[at + 3] / 255;
          for (let channel = 0; channel < 3; channel++) totals[channel] += data[at + channel] * weight;
          weights += weight;
        }
        if (!weights) return;
        const colour = totals.map(total => Math.round(total / weights)).join(',');
        measuredColours.set(art, colour);
        setSample({ art, colour });
      } catch {
        // Some artwork hosts permit display but do not permit reading pixels.
      }
    };
    image.src = art;
    return () => { image.onload = null; };
  }, [art]);

  return (art && (measuredColours.get(art) || (sample.art === art && sample.colour))) || fallback;
}

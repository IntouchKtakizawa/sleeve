// One revolution in 1.8 seconds is 33 1/3 RPM. Every stylus mark and label
// follows the same clock, including records that return to the visible window.
const revolutionMs = 1800;
export const cinematicRate = 8 * revolutionMs / 60000;

function timelineNow() {
  return Number(document.timeline.currentTime ?? performance.now());
}

export class RecordMotor {
  private rate = 0;
  private phase = 0;
  private since = 0;
  private rotors = new Map<Animation, number>();

  private phaseAt(time: number) {
    return (this.phase + (time - this.since) * this.rate) % revolutionMs;
  }

  private synchronise(animation: Animation, offset: number, now: number) {
    const angleTime = (this.phaseAt(now) + offset) % revolutionMs;
    if (this.rate === 0) {
      animation.pause();
      animation.currentTime = angleTime;
    } else {
      animation.playbackRate = this.rate;
      animation.play();
      animation.startTime = now - angleTime / this.rate;
    }
  }

  setRate(rate: number) {
    if (rate === this.rate) return;
    const now = timelineNow();
    this.phase = this.phaseAt(now);
    this.since = now;
    this.rate = rate;
    for (const [animation, offset] of this.rotors) this.synchronise(animation, offset, now);
  }

  attach(element: HTMLElement, trackIndex: number) {
    const animation = element.animate(
      [{ transform: 'rotate(0turn)' }, { transform: 'rotate(1turn)' }],
      { duration: revolutionMs, iterations: Infinity, easing: 'linear' },
    );
    animation.id = 'sleeve-record-spin';
    const offset = (trackIndex * 431) % revolutionMs;
    this.rotors.set(animation, offset);
    this.synchronise(animation, offset, timelineNow());
    return () => {
      this.rotors.delete(animation);
      animation.cancel();
    };
  }
}

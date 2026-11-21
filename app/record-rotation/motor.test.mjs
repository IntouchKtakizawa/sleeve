import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RecordMotor, cinematicRate } from './motor.ts';

test('pressings share a continuous clock across entry, pause and speed changes', () => {
  const timeline = { currentTime: 1000 };
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { timeline } });
  const turns = [];
  const element = { animate(frames, timing) {
    const animation = {
      frames, timing, playbackRate: 1, startTime: null, currentTime: null,
      play() { this.state = 'running'; }, pause() { this.state = 'paused'; }, cancel() { this.state = 'idle'; },
    };
    turns.push(animation);
    return animation;
  } };
  const phase = a => a.state === 'paused' ? a.currentTime : (timeline.currentTime - a.startTime) * a.playbackRate % 1800;
  try {
    const motor = new RecordMotor();
    motor.attach(element, 0);
    const first = turns[0];
    assert.equal(first.timing.duration, 1800);
    assert.equal(first.timing.iterations, Infinity);
    motor.setRate(1);
    timeline.currentTime += 625;
    motor.setRate(cinematicRate);
    assert.equal(phase(first), 625);
    timeline.currentTime += 2500;
    motor.setRate(0);
    assert.equal(phase(first), 1225);
    timeline.currentTime += 9000;
    assert.equal(phase(first), 1225);
    const leave = motor.attach(element, 4);
    const returningPhase = phase(turns[1]);
    leave();
    assert.equal(turns[1].state, 'idle');
    motor.attach(element, 4);
    assert.equal(phase(turns[2]), returningPhase);
    motor.setRate(1);
    assert.equal(phase(first), 1225);
    timeline.currentTime += 1800;
    assert.equal(phase(turns[2]), returningPhase);
  } finally {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else delete globalThis.document;
  }
});

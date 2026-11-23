import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergePlays, normalize, parseLastfm, parseSpotifyHistory, playKey, matchPlay } from './listening.ts';
import { compare, decodeProfile, encodeProfile, inPeriod, profileFrom, ratingStreak } from './taste.ts';

test('normalize ignores remaster/feat suffixes and punctuation', () => {
  assert.equal(normalize('Bohemian Rhapsody - Remastered 2011'), normalize('Bohemian Rhapsody'));
  assert.equal(normalize('Rich Flex (feat. 21 Savage)'), normalize('Rich Flex'));
  assert.equal(playKey('Beyoncé', 'HALO'), playKey('beyonce', 'Halo'));
});

test('Last.fm recent tracks merge repeats and keep now-playing', () => {
  const plays = parseLastfm({ recenttracks: { track: [
    { name: 'Halo', artist: { '#text': 'Beyoncé' }, album: { '#text': 'I Am…' }, '@attr': { nowplaying: 'true' }, image: [] },
    { name: 'Halo', artist: { '#text': 'Beyoncé' }, date: { uts: '1700000000' }, image: [{ size: 'extralarge', '#text': 'https://lastfm.freetls.fastly.net/i/u/300x300/abc.jpg' }] },
    { name: '', artist: { '#text': 'Nobody' } },
  ] } });
  assert.equal(plays.length, 1);
  assert.equal(plays[0].plays, 2);
  assert.equal(plays[0].nowPlaying, true);
  assert.match(plays[0].image, /^https:/);
});

test('Last.fm errors surface their message', () => {
  assert.throws(() => parseLastfm({ error: 6, message: 'User not found' }), /User not found/);
});

test('Spotify exports: both formats parse, short skips are ignored', () => {
  const basic = parseSpotifyHistory(JSON.stringify([
    { endTime: '2026-01-02 10:00', artistName: 'Radiohead', trackName: 'Reckoner', msPlayed: 200000 },
    { endTime: '2026-01-03 10:00', artistName: 'Radiohead', trackName: 'Reckoner', msPlayed: 180000 },
    { endTime: '2026-01-03 11:00', artistName: 'Radiohead', trackName: 'Skipped', msPlayed: 4000 },
  ]));
  assert.deepEqual(basic.map(p => [p.title, p.plays]), [['Reckoner', 2]]);
  const extended = parseSpotifyHistory(JSON.stringify([
    { ts: '2025-05-01T10:00:00Z', master_metadata_track_name: 'Nights', master_metadata_album_artist_name: 'Frank Ocean', master_metadata_album_album_name: 'Blonde', ms_played: 300000 },
    { ts: '2025-05-01T11:00:00Z', master_metadata_track_name: null, ms_played: 900000 },
  ]));
  assert.equal(extended[0].album, 'Blonde');
  assert.throws(() => parseSpotifyHistory('{"not":"a list"}'));
  assert.throws(() => parseSpotifyHistory('[]'), /No songs/);
});

test('mergePlays sums counts and keeps the latest time', () => {
  const a = { key: 'k', title: 'T', artist: 'A', album: '', image: '', playedAt: '2026-01-01T00:00:00Z', plays: 3 };
  const b = { ...a, playedAt: '2026-02-01T00:00:00Z', plays: 2 };
  assert.deepEqual(mergePlays([a], [b])[0], { ...b, plays: 5, nowPlaying: undefined });
});

test('matchPlay prefers an exact title and artist match', async () => {
  const songs = [
    { id: 1, title: 'Halo (Live)', artist: 'Beyoncé' }, { id: 2, title: 'Halo', artist: 'Depeche Mode' }, { id: 3, title: 'Halo', artist: 'Beyoncé' },
  ];
  const found = await matchPlay({ title: 'Halo', artist: 'Beyonce' }, async () => songs, new AbortController().signal);
  assert.equal(found.id, 3);
  assert.equal(await matchPlay({ title: 'Zzz', artist: 'Nobody' }, async () => songs, new AbortController().signal), undefined);
});

const song = (id, title, artist, extra = {}) => ({ id, title, artist, album: '', art: 'https://is1-ssl.mzstatic.com/a.jpg', url: '', genre: 'Pop', year: '2020', ...extra });
const rate = (s, score, updatedAt = '2026-11-20T10:00:00.000Z', favourite = false) => ({ trackId: s.id, song: s, score, note: 'secret', updatedAt, favourite });

test('taste links round-trip, drop notes, and reject tampered data', async () => {
  const mine = [rate(song(1, 'One', 'A'), 9, undefined, true), rate(song(2, 'Two', 'B'), 6), rate(song('4uLU6hMCjMI75M1A2tKUQC', 'Three', 'C', { source: 'spotify', art: 'javascript:alert(1)' }), 8)];
  const profile = await decodeProfile(await encodeProfile(profileFrom(mine, 'Kenta')));
  assert.equal(profile.n, 'Kenta');
  assert.equal(profile.items.length, 3);
  assert.equal(profile.items[0].f, 1);
  assert.ok(!JSON.stringify(profile).includes('secret'));
  assert.equal(profile.items.find(i => i.t === 'Three').art, undefined);
  await assert.rejects(decodeProfile('not-a-real-link'));
});

test('compare scores agreement and suggests their picks', () => {
  const s1 = song(1, 'One', 'A'), s2 = song(2, 'Two', 'B'), s3 = song(3, 'Three', 'C');
  const theirs = profileFrom([rate(s1, 9), rate(s2, 8), rate(s3, 9)], 'Friend');
  const close = compare([rate(s1, 9), rate(s2, 8)], theirs);
  const far = compare([rate(s1, 1), rate(s2, 2)], theirs);
  assert.ok(close.match > far.match);
  assert.equal(close.shared.length, 2);
  assert.deepEqual(close.theirPicks.map(i => i.t), ['Three']);
  assert.equal(compare([], theirs).match, null);
});

test('periods and streaks', () => {
  const now = new Date('2026-11-23T12:00:00');
  const r = d => rate(song(Math.random(), 'x', 'y'), 7, new Date(d).toISOString());
  const list = [r('2026-11-23T09:00:00'), r('2026-11-22T09:00:00'), r('2026-11-21T09:00:00'), r('2026-11-19T09:00:00'), r('2025-03-01T09:00:00')];
  assert.equal(ratingStreak(list, now), 3);
  assert.equal(inPeriod(list, 'month', now).length, 4);
  assert.equal(inPeriod(list, 'year', now).length, 4);
  assert.equal(ratingStreak([], now), 0);
});

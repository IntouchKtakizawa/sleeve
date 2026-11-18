import {test} from 'node:test';
import assert from 'node:assert/strict';
import {backup,parseBackup,mergeRatings,csv} from './local-library.ts';
const rating={trackId:42,song:{id:42,title:'Glass Eyes',artist:'Radiohead',album:'A Moon Shaped Pool',art:'https://is1-ssl.mzstatic.com/image.jpg',url:'https://music.apple.com/us/album/test/42',genre:'Alternative',year:'2016'},score:8.1,note:'A "great" song,\nreally.',favourite:true,updatedAt:'2026-11-18T01:00:00.000Z'};
test('backup round-trips all rating fields',()=>assert.deepEqual(parseBackup(backup([rating])),[rating]));
test('merge keeps newer records and unrelated existing songs',()=>{const old={...rating,score:4,updatedAt:'2026-11-17T01:00:00.000Z'};assert.equal(mergeRatings([rating],[old])[0].score,8.1);const next={...rating,score:9,updatedAt:'2026-11-19T01:00:00.000Z'};assert.equal(mergeRatings([old],[next])[0].score,9)});
test('malformed or future-format backups reject without touching input',()=>{for(const ratings of [[{...rating,score:11}],[{...rating,score:'8'}],[{...rating,trackId:99}],[{...rating,updatedAt:'bad'}],[{...rating,note:'x'.repeat(1001)}]])assert.throws(()=>parseBackup(JSON.stringify({app:'sleeve',version:1,ratings})));assert.throws(()=>parseBackup('{invalid'));assert.throws(()=>parseBackup('{"app":"sleeve","version":2,"ratings":[]}'));assert.equal(rating.score,8.1)});
test('unsafe imported URL schemes are discarded',()=>{const [r]=parseBackup(backup([{...rating,song:{...rating.song,art:'javascript:alert(1)',url:'https://evil.example/'}}]));assert.equal(r.song.art,'');assert.equal(r.song.url,'')});
test('CSV escapes quotes, multiline notes, and formula-leading cells',()=>{const out=csv([{...rating,song:{...rating.song,title:'=IMPORTXML("x")'}}]);assert.ok(out.includes('"\'=IMPORTXML(""x"")"'));assert.ok(out.includes('"A ""great"" song,\nreally."'))});
test('duplicate IDs normalize to a single newest record',()=>{assert.equal(parseBackup(backup([rating,rating])).length,1)});

test('an album and a song with the same ID keep separate ratings', () => {
  const album = { ...rating, song: { ...rating.song, kind: 'album' }, score: 9.2 };
  assert.deepEqual(parseBackup(backup([rating, album])), [rating, album]);
});

test('Spotify links and artwork survive a backup round trip', () => {
  const id = '0DiWol3AO6WpXZgp0goxAV';
  const track = { ...rating, trackId: id, song: { ...rating.song, id, source: 'spotify',
    url: 'https://open.spotify.com/track/' + id,
    art: 'https://image-cdn-fa.spotifycdn.com/image/one-more-time' } };
  assert.deepEqual(parseBackup(backup([track])), [track]);
});

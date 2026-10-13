const test = require('node:test');
const assert = require('node:assert/strict');
const { createGoogleTts } = require('./google-tts.cjs');
const { createServer } = require('./serve.cjs');
const lessons = require('./yugioh-lessons.json');
const mp3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(200)]);
const audioResponse = () => new Response(mp3, { headers: { 'content-type': 'audio/mpeg' } });

test('Google仅朗读题库假名，同一卡片合并请求并复用内存缓存', async () => {
  let calls = 0;
  const item = lessons.find(item => item.kana === 'アーマー・リザード');
  const read = createGoogleTts({ fetchAudio: async (url, options) => {
    calls++;
    assert.equal(url.origin, 'https://translate.google.com');
    assert.equal(url.searchParams.get('q'), item.kana);
    assert.equal(url.searchParams.get('tl'), 'ja');
    assert.ok(options.signal instanceof AbortSignal);
    return audioResponse();
  } });
  await assert.rejects(read('999999999'), { status: 404 });
  await assert.rejects(read('https://example.com'), { status: 404 });
  assert.equal(calls, 0);
  const clips = await Promise.all([read(item.cid), read(item.cid)]);
  assert.deepEqual(clips[0], mp3);
  assert.deepEqual(clips[1], mp3);
  assert.deepEqual(await read(item.cid), mp3);
  assert.equal(calls, 1);
});

test('上游拒绝、非音频及超时不缓存，之后可重试', async () => {
  for (const failure of [() => new Response('Denied', { status: 403 }), () => new Response('<html>error</html>'), () => new Response('bad', { headers: { 'content-type': 'audio/mpeg' } }), () => { throw new DOMException('Timed out', 'TimeoutError'); }]) {
    let calls = 0;
    const read = createGoogleTts({ fetchAudio: async () => ++calls === 1 ? failure() : audioResponse() });
    await assert.rejects(read(lessons[0].cid));
    assert.deepEqual(await read(lessons[0].cid), mp3);
    assert.equal(calls, 2);
  }
});

test('在线路由返回MP3及Range，未知卡号404，上游异常502', async t => {
  const server = createServer({ getGoogleAudio: async cid => {
    if (cid === '1') return mp3;
    throw Object.assign(new Error('unavailable'), { status: cid === '2' ? 404 : 502 });
  } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api/pronunciation/`;
  const clip = await fetch(base + '1');
  assert.equal(clip.headers.get('content-type'), 'audio/mpeg');
  assert.deepEqual(Buffer.from(await clip.arrayBuffer()), mp3);
  const partial = await fetch(base + '1', { headers: { Range: 'bytes=0-2' } });
  assert.equal(partial.status, 206);
  assert.equal(await partial.text(), 'ID3');
  const head = await fetch(base + '1', { method: 'HEAD' });
  assert.equal(head.headers.get('content-length'), String(mp3.length));
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  assert.equal((await fetch(base + '2')).status, 404);
  assert.equal((await fetch(base + '3')).status, 502);
  assert.equal((await fetch(base + '1', { method: 'POST' })).status, 405);
  assert.equal((await fetch(base + 'https%3A%2F%2Fexample.com')).status, 404);
});

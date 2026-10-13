const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createServer } = require('./serve.cjs');

test('音频服务支持PCM、HEAD与浏览器字节范围请求', async t => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}`;
  const bytes = fs.readFileSync(path.join(__dirname, 'audio/4064.wav'));
  const full = await fetch(url + '/audio/4064.wav');
  assert.equal(full.status, 200);
  assert.equal(full.headers.get('content-type'), 'audio/wav');
  assert.equal(full.headers.get('accept-ranges'), 'bytes');
  assert.deepEqual(Buffer.from(await full.arrayBuffer()), bytes);
  const head = await fetch(url + '/audio/4064.wav', { method: 'HEAD' });
  assert.equal(head.headers.get('content-length'), String(bytes.length));
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  for (const [range, first, last] of [['bytes=0-43', 0, 43], ['bytes=44-', 44, bytes.length - 1], ['bytes=-100', bytes.length - 100, bytes.length - 1]]) {
    const partial = await fetch(url + '/audio/4064.wav', { headers: { Range: range } });
    assert.equal(partial.status, 206);
    assert.equal(partial.headers.get('content-range'), `bytes ${first}-${last}/${bytes.length}`);
    assert.deepEqual(Buffer.from(await partial.arrayBuffer()), bytes.subarray(first, last + 1));
  }
  for (const range of ['bytes=999999999-', 'bytes=12-3', 'bytes=-0', 'bad']) {
    const invalid = await fetch(url + '/audio/4064.wav', { headers: { Range: range } });
    assert.equal(invalid.status, 416);
    assert.equal(invalid.headers.get('content-range'), `bytes */${bytes.length}`);
  }
  assert.equal((await fetch(url + '/audio/9999999.wav')).status, 404);
  assert.equal((await fetch(url + '/audio/%2e%2e%2fapp.js')).status, 404);
  assert.equal((await fetch(url + '/app.js')).status, 200);
});

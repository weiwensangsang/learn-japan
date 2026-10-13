const lessons = require('./yugioh-lessons.json');
const targets = new Map(lessons.map(item => [String(item.cid), item.kana]));

// Google Translate's unauthenticated speech endpoint, not the Cloud TTS API.
// Only the public kana targets in our card bank can be sent to it.
function createGoogleTts({ fetchAudio = fetch, timeoutMs = 8000 } = {}) {
  const cache = new Map();
  const pending = new Map();
  return async function getAudio(cid) {
    cid = String(cid);
    const kana = targets.get(cid);
    if (!kana) throw Object.assign(new Error('Unknown card'), { status: 404 });
    if (cache.has(cid)) return cache.get(cid);
    if (pending.has(cid)) return pending.get(cid);
    const request = (async () => {
      const url = new URL('https://translate.google.com/translate_tts');
      url.search = new URLSearchParams({ ie: 'UTF-8', tl: 'ja', client: 'tw-ob', q: kana });
      const response = await fetchAudio(url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'error' });
      if (!response.ok || !/^audio\/mpeg(?:;|$)/i.test(response.headers.get('content-type') || '')) throw new Error('Google did not return MP3 audio');
      const bytes = Buffer.from(await response.arrayBuffer());
      const mp3 = bytes.subarray(0, 3).toString() === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
      if (!mp3 || bytes.length < 128 || bytes.length > 1024 * 1024) throw new Error('Invalid Google audio');
      cache.set(cid, bytes);
      return bytes;
    })();
    pending.set(cid, request);
    try { return await request; }
    finally { pending.delete(cid); }
  };
}

module.exports = { createGoogleTts };

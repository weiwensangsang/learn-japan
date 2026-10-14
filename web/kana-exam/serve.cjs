const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createGoogleTts } = require('./google-tts.cjs');
const root = __dirname;
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg' };
const allowed = new Set(['index.html', 'styles.css', 'kana-data.js', 'yugioh-data.js', 'core.js', 'app.js']);
function createServer({ getGoogleAudio = createGoogleTts() } = {}) {
  return http.createServer(async (req, res) => {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }
    let name;
    try { name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\//, '') || 'index.html'; }
    catch { res.writeHead(400); return res.end('Bad request'); }
    const onlineAudio = /^api\/pronunciation\/([0-9]+)$/.exec(name);
    if (onlineAudio) {
      try {
        const content = await getGoogleAudio(onlineAudio[1]);
        return sendContent(req, res, content, 'audio/mpeg', true);
      } catch (error) {
        const status = error.status === 404 ? 404 : 502;
        res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(req.method === 'HEAD' ? undefined : status === 404 ? 'Unknown card' : 'Google 在线读音暂时不可用，请检查网络后重试。');
      }
    }
    if (!allowed.has(name) && !/^cards\/[0-9]+\.(?:png|jpg)$/.test(name)) { res.writeHead(404); return res.end('Not found'); }
    fs.readFile(path.join(root, name), (error, content) => {
      if (error) { res.writeHead(404); return res.end('Not found'); }
      sendContent(req, res, content, types[path.extname(name)], false);
    });
  });
}
function sendContent(req, res, content, type, audio) {
      const headers = { 'Content-Type': type, 'Cache-Control': 'no-store', 'Content-Length': content.length };
      if (audio) headers['Accept-Ranges'] = 'bytes';
      let start = 0, end = content.length - 1, status = 200;
      // Browsers can request metadata or seek to a byte range before playing.
      if (audio && req.method === 'GET' && req.headers.range) {
        const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        if (range && (range[1] || range[2])) {
          if (range[1]) { start = Number(range[1]); end = range[2] ? Math.min(Number(range[2]), end) : end; }
          else start = Math.max(0, content.length - Number(range[2]));
        } else start = content.length;
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start < 0) {
          res.writeHead(416, { 'Content-Range': `bytes */${content.length}`, 'Content-Length': 0 }); return res.end();
        }
        status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${content.length}`; headers['Content-Length'] = end - start + 1;
      }
      res.writeHead(status, headers);
      res.end(req.method === 'HEAD' ? undefined : content.subarray(start, end + 1));
}
module.exports = { createServer };
if (require.main === module) {
  // Honour the machine's existing proxy configuration, including for fetch().
  http.setGlobalProxyFromEnv?.();
  const port = Number(process.env.KANA_PORT) || 4173;
  createServer().listen(port, '127.0.0.1', () => console.log('Local: http://127.0.0.1:' + port));
}

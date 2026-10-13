const fs = require('node:fs');
const path = require('node:path');
const date = value => new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
const decode = text => text.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
function take(html, expression, label) {
  const match = html.match(expression);
  if (!match) throw Error('官方卡页缺少' + label);
  return decode(match[1].trim());
}
async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error(`${response.status}: ${url}`);
  return response;
}
async function loadCard(cid, cacheDir) {
  const sourceUrl = `https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=${cid}&request_locale=ja`;
  const cached = cacheDir && path.join(cacheDir, `${cid}.json`);
  if (cached && fs.existsSync(cached)) {
    const card = JSON.parse(fs.readFileSync(cached, 'utf8'));
    if (card.cid !== cid || card.sourceUrl !== sourceUrl) throw Error('卡页缓存不匹配：' + cid);
    return card;
  }
  const htmlFile = cacheDir && path.join(cacheDir, `${cid}.html`);
  const hasHtml = htmlFile && fs.existsSync(htmlFile);
  const html = hasHtml ? fs.readFileSync(htmlFile, 'utf8') : await (await download(sourceUrl)).text();
  const card = { cid, sourceUrl,
    cardName: take(html, /<meta name="title" content="([^|]+)/, '名称'),
    cardReading: take(html, /<span class="ruby">([^<]+)<\/span>/, '读法'),
    description: take(html, /<meta name="description" content="([^"]+)/, '文本'),
    imageSource: take(html, /<meta property='og:image' content="([^"]+)/, '卡面'),
    checkedAt: date(hasHtml ? fs.statSync(htmlFile).mtime : Date.now()),
  };
  if (cached) { fs.mkdirSync(cacheDir, { recursive: true }); fs.writeFileSync(cached, JSON.stringify(card, null, 2) + '\n'); }
  return card;
}
async function cacheImage(card, root = __dirname) {
  const source = new URL(card.imageSource);
  if (source.hostname !== 'www.db.yugioh-card.com' || source.searchParams.get('request_locale') !== 'ja') throw Error('日文卡面来源异常：' + card.cid);
  const dir = path.join(root, 'cards');
  fs.mkdirSync(dir, { recursive: true });
  const cached = ['png', 'jpg'].map(ext => path.join(dir, `${card.cid}.${ext}`)).find(file => fs.existsSync(file));
  const bytes = cached ? fs.readFileSync(cached) : Buffer.from(await (await download(card.imageSource)).arrayBuffer());
  const extension = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'png' : bytes[0] === 0xff && bytes[1] === 0xd8 ? 'jpg' : null;
  if (bytes.length < 1000 || !extension) throw Error('卡面不是有效PNG或JPEG：' + card.cid);
  const image = `cards/${card.cid}.${extension}`;
  if (cached && cached !== path.join(root, image)) throw Error('缓存卡面扩展名错误：' + card.cid);
  if (!cached) fs.writeFileSync(path.join(root, image), bytes);
  return image;
}
module.exports = { loadCard, cacheImage };

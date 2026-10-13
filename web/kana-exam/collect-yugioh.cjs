// 一次性扩展用：从已保存的 YGOPRODeck 索引核对早期卡片，最多两个并行请求。
const fs = require('node:fs');
const path = require('node:path');
const { loadCard } = require('./yugioh-source.cjs');
const sourceDir = process.argv[2], cacheDir = process.argv[3];
async function getJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw Error(`${response.status}: ${url}`);
  return response.json();
}
async function prepareSources() {
  fs.mkdirSync(sourceDir, { recursive: true });
  const indexFile = path.join(sourceDir, 'card-index.json');
  if (!fs.existsSync(indexFile)) {
    console.log('下载 YGOPRODeck 卡号索引');
    fs.writeFileSync(indexFile, JSON.stringify(await getJson('https://db.ygoprodeck.com/api/v7/cardinfo.php?misc=yes')));
  }
  const revisionFile = path.join(sourceDir, 'zh-source.json');
  if (!fs.existsSync(revisionFile)) fs.writeFileSync(revisionFile, JSON.stringify(await getJson('https://api.github.com/repos/mycard/ygopro-database/commits?path=locales/zh-CN/cards.cdb&per_page=1')));
  const namesFile = path.join(sourceDir, 'zh-names.json');
  if (!fs.existsSync(namesFile)) {
    console.log('下载固定版本的社区中文卡名数据库');
    const revision = JSON.parse(fs.readFileSync(revisionFile, 'utf8'))[0].sha;
    const metadata = await getJson(`https://api.github.com/repos/mycard/ygopro-database/contents/locales/zh-CN/cards.cdb?ref=${revision}`);
    const blob = await getJson(metadata.git_url);
    if (blob.encoding !== 'base64') throw Error('中文数据库内容编码异常');
    const databaseFile = path.join(sourceDir, 'zh-cards.cdb');
    fs.writeFileSync(databaseFile, Buffer.from(blob.content, 'base64'));
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(databaseFile, { readOnly: true });
    try { fs.writeFileSync(namesFile, JSON.stringify(Object.fromEntries(db.prepare('SELECT id,name FROM texts').all().map(row => [row.id, row.name])))); }
    finally { db.close(); }
  }
}
async function main() {
  if (!sourceDir || !cacheDir) throw Error('用法：node collect-yugioh.cjs <索引目录> <卡页缓存目录>');
  await prepareSources();
  const index = JSON.parse(fs.readFileSync(path.join(sourceDir, 'card-index.json'), 'utf8')).data;
  const byCid = new Map();
  for (const card of index) {
    if (['Token', 'Skill Card'].includes(card.type)) continue;
    const cid = card.misc_info?.[0]?.konami_id;
    if (Number.isInteger(cid) && cid > 0 && !byCid.has(cid)) byCid.set(cid, { cid, id: card.id, englishName: card.name });
  }
  const candidates = [...byCid.values()].sort((a, b) => a.cid - b.cid).slice(0, 650);
  fs.writeFileSync(path.join(sourceDir, 'candidates.json'), JSON.stringify(candidates, null, 2) + '\n');
  let cursor = 0, done = 0;
  async function worker() {
    while (cursor < candidates.length) {
      const card = candidates[cursor++];
      const cached = ['json', 'html'].some(ext => fs.existsSync(path.join(cacheDir, `${card.cid}.${ext}`)));
      await loadCard(card.cid, cacheDir);
      if (++done % 25 === 0 || done === candidates.length) console.log(`已核对 ${done}/${candidates.length} 个官方卡页`);
      if (!cached) await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  await Promise.all([worker(), worker()]);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

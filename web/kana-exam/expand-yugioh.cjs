// 用官方注音扩展卡名题。原有短词题保留；不把同卡异画或同词算作新题。
const fs = require('node:fs');
const path = require('node:path');
const { cacheImage } = require('./yugioh-source.cjs');
const { makeWordLesson, scriptFor } = require('./kana-words.cjs');
const sourceDir = process.argv[2], cacheDir = process.argv[3];
async function main() {
  if (!sourceDir || !cacheDir) throw Error('用法：node expand-yugioh.cjs <索引和中文名目录> <官方卡页缓存目录>');
  const target = path.join(__dirname, 'yugioh-lessons.json');
  const lessons = JSON.parse(fs.readFileSync(target, 'utf8'));
  for (const lesson of lessons) if (lesson.cardId) Object.assign(lesson, makeWordLesson(lesson.kana));
  if (lessons.length > 500) throw Error('已有题库超过500张，请先检查维护清单');
  const names = JSON.parse(fs.readFileSync(path.join(sourceDir, 'zh-names.json'), 'utf8'));
  const revision = JSON.parse(fs.readFileSync(path.join(sourceDir, 'zh-source.json'), 'utf8'))[0].sha;
  if (!/^[a-f0-9]{40}$/.test(revision)) throw Error('中文来源版本号不正确');
  const meaningSource = `https://github.com/mycard/ygopro-database/blob/${revision}/locales/zh-CN/cards.cdb`;
  const candidates = JSON.parse(fs.readFileSync(path.join(sourceDir, 'candidates.json'), 'utf8'));
  const cardIds = new Set(lessons.map(item => item.cid)), words = new Set(lessons.map(item => item.kana));
  const skipped = [];
  for (const candidate of candidates) {
    if (lessons.length === 500) break;
    if (cardIds.has(candidate.cid)) continue;
    const file = path.join(cacheDir, `${candidate.cid}.json`);
    if (!fs.existsSync(file)) throw Error('尚未核对官方卡页：' + candidate.cid);
    const card = JSON.parse(fs.readFileSync(file, 'utf8'));
    const kana = card.cardReading;
    if (!names[candidate.id] || words.has(kana) || kana.length > 20 || /[A-Za-zＡ-Ｚａ-ｚ0-9０-９]/.test(kana)) { skipped.push({ cid: card.cid, kana, reason: '重名、过长或不适合当前假名题' }); continue; }
    let word;
    try { word = makeWordLesson(kana); } catch (error) { skipped.push({ cid: card.cid, kana, reason: error.message }); continue; }
    const script = scriptFor(kana);
    lessons.push({ cid: card.cid, cardId: candidate.id, kana, ...word,
      row: script === 'mixed' ? 'mixed-names' : script === 'hiragana' ? 'hiragana-names' : 'katakana-names',
      sourceKind: kana === card.cardName ? 'name' : 'reading',
      meaning: names[candidate.id] + '（卡名，社区译名）', meaningSource });
    cardIds.add(card.cid); words.add(kana);
  }
  if (lessons.length !== 500) throw Error(`合格卡片只有 ${lessons.length} 张，需要扩大候选范围`);
  fs.writeFileSync(path.join(sourceDir, 'skipped.json'), JSON.stringify(skipped, null, 2) + '\n');
  let cursor = 0, done = 0;
  async function worker() {
    while (cursor < lessons.length) {
      const item = lessons[cursor++];
      const file = path.join(cacheDir, `${item.cid}.json`);
      // 原有24张可能在650张候选之外，由 sync-yugioh.cjs 沿用既有来源。
      const alreadyCached = ['png', 'jpg'].some(ext => fs.existsSync(path.join(__dirname, 'cards', `${item.cid}.${ext}`)));
      if (fs.existsSync(file)) await cacheImage(JSON.parse(fs.readFileSync(file, 'utf8')));
      if (++done % 25 === 0) console.log(`已缓存 ${done}/500 张日文卡面`);
      if (!alreadyCached) await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  await Promise.all([worker(), worker()]);
  fs.writeFileSync(target, JSON.stringify(lessons, null, 2) + '\n');
  console.log('500张卡片清单已写入。分组：', Object.fromEntries([...new Set(lessons.map(item => item.row))].map(row => [row, lessons.filter(item => item.row === row).length])));
  console.log(`跳过 ${skipped.length} 张不适合的候选，详见临时来源目录 skipped.json。`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

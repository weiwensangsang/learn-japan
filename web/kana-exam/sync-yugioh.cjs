// 核对官方日文卡页，缓存原始 SAMPLE 卡面，生成离线学习题库。
const fs = require('node:fs');
const path = require('node:path');
const { loadCard, cacheImage } = require('./yugioh-source.cjs');
const { scriptFor } = require('./kana-words.cjs');
const cacheIndex = process.argv.indexOf('--cache-dir');
const cacheDir = cacheIndex >= 0 ? process.argv[cacheIndex + 1] : null;
async function main() {
  const lessons = JSON.parse(fs.readFileSync(path.join(__dirname, 'yugioh-lessons.json'), 'utf8'));
  const data = [];
  for (const lesson of lessons) {
    const card = await loadCard(lesson.cid, cacheDir);
    const { cardName, cardReading, description, imageSource, sourceUrl, checkedAt } = card;
    const context = lesson.sourceKind === 'text' ? lesson.context : lesson.sourceKind === 'reading' ? cardReading : cardName;
    const original = lesson.sourceKind === 'text' ? description : lesson.sourceKind === 'reading' ? cardReading : cardName;
    if (!original.includes(context) || !context.includes(lesson.kana)) throw Error('官方原文中找不到目标：' + lesson.kana);
    if (lesson.parts.map(part => part[0]).join('') !== lesson.kana || lesson.parts.map(part => part[1]).join('') !== lesson.romaji) throw Error('拆音不一致：' + lesson.kana);
    const image = await cacheImage(card);
    const { parts, note, ...rest } = lesson;
    data.push({ ...rest, script: scriptFor(lesson.kana), cardName, cardReading, context,
      parts, hint: note, image, imageSource, sourceUrl, checkedAt });
    if (data.length % 50 === 0) console.log(`已生成 ${data.length}/${lessons.length} 张卡的题目`);
  }
  if (new Set(data.map(item => item.cid)).size !== data.length || new Set(data.map(item => item.kana)).size !== data.length) throw Error('卡片或目标重复');
  const set = { label: '游戏王', unit: '张卡', rows: [
    { id: 'katakana-names', label: '片假名卡名', kana: 'クリボー・エルフ' },
    { id: 'hiragana-names', label: '平假名卡名', kana: 'ひかり・こころ' },
    { id: 'mixed-names', label: '平片混合卡名', kana: '两种假名连起来读' },
    { id: 'card-terms', label: '卡片用语', kana: 'デッキ・その' },
  ].filter(row => data.some(item => item.row === row.id)).map(row => ({ ...row, count: data.filter(item => item.row === row.id).length })), data };
  fs.writeFileSync(path.join(__dirname, 'yugioh-data.js'), '// 由 sync-yugioh.cjs 核对官方日文卡页并生成。\nwindow.KANA_SETS.yugioh = ' + JSON.stringify(set, null, 2) + ';\n');
  console.log(`已生成 ${data.length} 张不同卡片，包含 ${new Set(data.map(item => item.image)).size} 张日文卡面。`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

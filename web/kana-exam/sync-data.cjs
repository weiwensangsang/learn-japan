// 从用户维护的速记法生成浏览器数据；不另外维护一套口诀。
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../docs/gojuon-learning-method.md'), 'utf8');
const groups = [
  ['a', 'あいうえお', 'アイウエオ'], ['k', 'かきくけこ', 'カキクケコ'],
  ['s', 'さしすせそ', 'サシスセソ'], ['t', 'たちつてと', 'タチツテト'],
  ['n', 'なにぬねの', 'ナニヌネノ'], ['h', 'はひふへほ', 'ハヒフヘホ'],
  ['m', 'まみむめも', 'マミムメモ'], ['y', 'やゆよ', 'ヤユヨ'],
  ['r', 'らりるれろ', 'ラリルレロ'], ['w', 'わをん', 'ワヲン'],
];

function readSet(script, label, column, header) {
  const lines = source.split(/\r?\n/);
  const start = lines.indexOf(header);
  if (start < 0) throw Error('找不到' + label + '速记主表');
  const rows = groups.map(group => ({
    id: group[0], label: group[0] === 'w' ? group[column][0] + '・' + group[column][2] : group[column][0] + '行', kana: group[column],
  }));
  const data = [];
  for (const line of lines.slice(start + 2)) {
    if (!line.startsWith('|')) break;
    const [kana, reading, hint] = line.split('|').slice(1, -1).map(cell => cell.trim());
    const row = rows.find(row => row.kana.includes(kana));
    if (!kana || !row || !reading || !hint) throw Error(label + '主表条目不完整：' + line);
    data.push({ kana, romaji: reading.split(/[（\s]/)[0], hint, row: row.id, script });
  }
  if (data.length !== 46 || data.map(item => item.kana).join('') !== rows.map(row => row.kana).join('')) {
    throw Error(label + '速记法必须按音表顺序包含46个独立假名');
  }
  return { label, rows, data };
}

const sets = {
  hiragana: readSet('hiragana', '平假名', 1, '| 平假名 | 读音 | 选定的记忆线索 |'),
  katakana: readSet('katakana', '片假名', 2, '| 片假名 | 读音 | 记忆线索 | 实际字源 |'),
};
sets.mixed = {
  label: '平片混合',
  rows: sets.hiragana.rows.map((row, index) => ({
    ...row, label: row.kana[0] + '／' + sets.katakana.rows[index].kana[0] + (row.id === 'w' ? '・ん／ン' : '行'),
    alternate: sets.katakana.rows[index].kana,
  })),
  data: [...sets.hiragana.data, ...sets.katakana.data],
};
fs.writeFileSync(path.join(__dirname, 'kana-data.js'), '// 由 sync-data.cjs 从 docs/gojuon-learning-method.md 生成。\nwindow.KANA_SETS = ' + JSON.stringify(sets, null, 2) + ';\n');
console.log('已同步平假名46字、片假名46字及混合题库，均沿用主文档提示。');

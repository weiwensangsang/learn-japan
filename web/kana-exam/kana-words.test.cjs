const test = require('node:test');
const assert = require('node:assert/strict');
const { splitReading, makeWordLesson, scriptFor } = require('./kana-words.cjs');

test('官方假名的常见长音、促音、拗音及外来音正确拆读', () => {
  const examples = {
    'ブルーアイズ・ホワイト・ドラゴン': 'buruuaizu howaito doragon',
    'ブラック・マジシャン': 'burakku majishan',
    'デッキ': 'dekki', 'クリッター': 'kurittaa', 'マシュマロン': 'mashumaron',
    'ハーピィ': 'haapii', 'フェアリー': 'fearii', 'ウォーター': 'wootaa',
    'ディスク': 'disuku', 'ヴィクトリー': 'vikutorii',
    'ヂェミナイ・エルフ': 'jeminai erufu',
    'しんえん': "shin'en", 'しんよう': "shin'you", 'まっちゃ': 'matcha',
    'ししゃそせい': 'shishasosei', 'ひかりのごふうけん': 'hikarinogofuuken',
    'カードをかるしにがみ': 'kaadookarushinigami',
  };
  for (const [kana, reading] of Object.entries(examples)) {
    const lesson = makeWordLesson(kana);
    assert.equal(lesson.romaji, reading);
    assert.equal(lesson.parts.map(part => part[0]).join(''), kana);
    assert.equal(new Set([reading, ...lesson.distractors]).size, 4);
  }
});

test('不猜汉字、数字及无法处理的假名读音', () => {
  for (const text of ['青眼の白龍', 'バーバリアン２ごう', 'ー', 'っ', 'っあ']) assert.throws(() => splitReading(text));
  assert.equal(scriptFor('ひかり'), 'hiragana');
  assert.equal(scriptFor('クリボー'), 'katakana');
  assert.equal(scriptFor('カードをかるしにがみ'), 'mixed');
});

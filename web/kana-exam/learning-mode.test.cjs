const test = require('node:test');
const assert = require('node:assert/strict');
const { explainWord, compareReading, makeCardExamDeck } = require('./core.js');
const { makeWordLesson } = require('./kana-words.cjs');
const lessons = require('./yugioh-lessons.json');
const word = kana => ({ kana, ...makeWordLesson(kana) });

test('考试固定20张且不重复，不足20张时拒绝开始而不是重复补题', () => {
  const deck = makeCardExamDeck(lessons);
  assert.equal(deck.length, 20);
  assert.equal(new Set(deck.map(item => item.cid)).size, 20);
  assert.equal(new Set(deck.map(item => item.kana)).size, 20);
  assert.throws(() => makeCardExamDeck(lessons.slice(0, 19)), /至少20张/);
  assert.throws(() => makeCardExamDeck(Array(20).fill(lessons[0])), /至少20张/);
});

test('用户询问的アーマー・リザード逐项解释长音、浊点和分隔符', () => {
  const rules = explainWord(word('アーマー・リザード'));
  const long = rules.find(r => r.kind === 'long');
  assert.deepEqual(long.examples, ['アー → aa', 'マー → maa', 'ザー → zaa']);
  assert.match(long.explanation, /不是汉字/);
  assert.deepEqual(rules.find(r => r.kind === 'dakuten').examples, ['サ sa → ザ za', 'ト to → ド do']);
  assert.match(rules.find(r => r.kind === 'separator').explanation, /不增加读音/);
});

test('小促音、大小拗音、半浊点、外来音及平假名有具体解释', () => {
  assert.deepEqual(explainWord(word('デッキ')).find(r => r.kind === 'sokuon').examples, ['ッキ → kki']);
  const yoon = explainWord(word('シャ')).find(r => r.kind === 'yoon');
  assert.match(yoon.explanation, /シヤ.*shi＋ya.*两拍/);
  assert.ok(!explainWord(word('シヤ')).some(r => r.kind === 'yoon'));
  assert.deepEqual(explainWord(word('ぱ')).find(r => r.kind === 'handakuten').examples, ['は ha → ぱ pa']);
  assert.deepEqual(explainWord(word('フェアリーティア')).find(r => r.kind === 'small-vowel').examples, ['フェ → fe', 'ティ → ti']);
  assert.ok(explainWord({ kana: 'ピィ', romaji: 'pii', parts: [['ピィ', 'pii']] }).some(r => r.kind === 'small-long'));
  assert.ok(explainWord(word('ひかり')).some(r => r.kind === 'plain'));
  assert.ok(explainWord(word('あんよ')).some(r => r.kind === 'nasal'));
});

test('500张卡都有可读解释，正确读音逐段全对且不改变题库', () => {
  const snapshot = JSON.stringify(lessons);
  for (const item of lessons) {
    const rules = explainWord(item);
    assert.ok(rules.length, item.kana);
    assert.ok(!/undefined|null/.test(JSON.stringify(rules)), item.kana);
    const comparison = compareReading(item, item.romaji);
    assert.equal(comparison.correct, true, item.kana);
    assert.ok(comparison.parts.every(p => p.status === 'correct' || p.status === 'separator'), item.kana);
  }
  assert.equal(JSON.stringify(lessons), snapshot);
});

test('输入兼容大小写、全角字母、空格和连字符，保留真实音差', () => {
  const item = word('アーマー・リザード');
  assert.equal(compareReading(item, ' ＡＡＭＡＡ - RIZAADO ').correct, true);
  assert.equal(compareReading(item, 'aama rizaato').correct, false);
  assert.equal(compareReading(word('あんよ'), 'AN’YO').correct, true);
  assert.equal(compareReading(word('あんよ'), 'anyo').correct, false);
});

test('漏掉长音或促音时，标出实际遗漏的符号，不误判邻接假名', () => {
  for (const [kana, input, missingKana] of [['カー', 'ka', 'ー'], ['デッキ', 'deki', 'ッ']]) {
    const result = compareReading(word(kana), input);
    assert.equal(result.correct, false);
    assert.deepEqual(result.parts.filter(p => p.status === 'wrong').map(p => p.kana), [missingKana]);
    assert.ok(result.parts.find(p => p.kana === missingKana).segments.some(s => s.status === 'missing'));
  }
});

test('替换、多写、空输入和不支持的字符均保留逐段对照', () => {
  const wrong = compareReading(word('リザード'), 'risaado');
  assert.deepEqual(wrong.parts.filter(p => p.status === 'wrong').map(p => p.kana), ['ザ']);
  assert.deepEqual(wrong.parts[1].segments[0], { expected: 'z', actual: 's', status: 'wrong' });
  const extra = compareReading(word('デッキ'), 'dekkix');
  assert.ok(extra.parts.at(-1).segments.some(s => s.status === 'extra' && s.actual === 'x'));
  const empty = compareReading(word('デッキ'), '');
  assert.ok(empty.parts.every(p => p.segments.every(s => s.status === 'missing')));
  assert.equal(compareReading(word('デッキ'), '<script>').correct, false);
});

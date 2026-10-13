const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('./core.js');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(__dirname + '/kana-data.js', 'utf8'), context);
const sets = context.window.KANA_SETS;
const data = Array.from(sets.hiragana.data);
const katakana = Array.from(sets.katakana.data);
const mixed = Array.from(sets.mixed.data);
const find = kana => mixed.find(item => item.kana === kana);

test('两套基本假名各46字，混合92字，保留用户最新口诀', () => {
  for (const [script, expected] of [['hiragana', 46], ['katakana', 46], ['mixed', 92]]) {
    const items = sets[script].data;
    assert.equal(items.length, expected);
    assert.equal(new Set(items.map(k => k.kana)).size, expected);
    assert.ok(items.every(item => item.hint && item.romaji && sets[script].rows.some(row => row.id === item.row)));
  }
  assert.match(find('ち').hint, /乞/);
  assert.match(find('ね').hint, /neko/);
  assert.match(find('お').hint, /右上有点/);
  assert.match(find('ム').hint, /牟/);
  assert.match(find('ヨ').hint, /右手一挥舞/);
  assert.match(find('ラ').hint, /像平假名ら/);
  assert.match(find('ン').hint, /上划.*捅鼻子.*嗯.*n/);
  assert.equal(find('ヲ').romaji, 'o');
  assert.equal(find('を').romaji, 'o');
});

for (const [name, pool] of [['平假名', data], ['片假名', katakana], ['混合', mixed]]) {
  test(name + '每局20题，完整范围不重复且不改题库', () => {
    const order = pool.map(k => k.kana);
    const deck = core.makeDeck(pool);
    assert.equal(deck.length, 20);
    assert.equal(new Set(deck.map(k => k.kana)).size, 20);
    assert.deepEqual(pool.map(k => k.kana), order);
    assert.ok(deck.every(item => pool.includes(item)));
  });
  test(name + '全部题目四个不同读音，只有一个正确答案', () => {
    for (const item of pool) {
      const choices = core.makeReadingChoices(item, pool);
      assert.equal(choices.length, 4);
      assert.equal(new Set(choices).size, 4);
      assert.equal(choices.filter(value => value === item.romaji).length, 1);
      assert.ok(!choices.includes('wo'));
    }
  });
}

test('混合模式在极端随机序列下也包含两种假名', () => {
  for (const random of [() => 0, () => .999999]) {
    const deck = core.makeDeck(mixed, 20, random);
    assert.equal(new Set(deck.map(item => item.script)).size, 2);
    assert.equal(new Set(deck.map(item => item.kana)).size, 20);
  }
});

test('小范围与错字重考按实际字数出题，一局不重复且不引入未选字', () => {
  for (const pool of [data.slice(0, 5), katakana.slice(0, 5), [find('く'), find('ク')]]) {
    const deck = core.makeDeck(pool);
    assert.equal(deck.length, pool.length);
    assert.equal(new Set(deck.map(k => k.kana)).size, pool.length);
    assert.ok(deck.every(item => pool.includes(item)));
  }
  assert.deepEqual(core.makeDeck([find('ク')]), [find('ク')]);
  assert.throws(() => core.makeDeck([]));
});

test('即使输入重复条目，同一个字也只出一次；同音不同字仍分别保留', () => {
  const pool = [find('オ'), { ...find('オ') }, find('ヲ'), find('お'), find('を'), find('ヲ')];
  const original = pool.slice();
  for (const count of [20, 'all', 100]) {
    const deck = core.makeDeck(pool, count);
    assert.equal(deck.length, 4);
    assert.deepEqual(new Set(deck.map(item => item.kana)), new Set(['オ', 'ヲ', 'お', 'を']));
  }
  assert.deepEqual(pool, original);
});

test('错字与跳过计入已答题，计分不混淆同音的不同字形', () => {
  const results = core.score([{ item: find('あ'), correct: true }, { item: find('ア'), correct: false }, { item: find('ン'), correct: false, skipped: true }]);
  assert.equal(results.correct, 1);
  assert.equal(results.total, 3);
  assert.deepEqual(results.wrong.map(answer => answer.item.kana), ['ア', 'ン']);
  assert.equal(core.score([]).total, 0);
});

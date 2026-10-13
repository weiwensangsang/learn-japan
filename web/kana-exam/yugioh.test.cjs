const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { makeDeck, makeReadingChoices } = require('./core.js');
const context = { window: {} };
for (const file of ['kana-data.js', 'yugioh-data.js']) vm.runInNewContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), context);
const { data, rows } = context.window.KANA_SETS.yugioh;

test('第三关每张卡只考一个词，拆音与正确读音一致，来源和本地卡面完整', () => {
  assert.equal(data.length, 500);
  assert.equal(new Set(data.map(item => item.cid)).size, data.length);
  assert.equal(new Set(data.map(item => item.kana)).size, data.length);
  for (const item of data) {
    assert.ok(rows.some(row => row.id === item.row));
    assert.ok(['name', 'reading', 'text'].includes(item.sourceKind));
    assert.ok(item.context.includes(item.kana));
    assert.ok(item.cardName && item.cardReading && item.hint && item.meaning);
    assert.equal(item.parts.map(part => part[0]).join(''), item.kana);
    assert.equal(item.parts.map(part => part[1]).join(''), item.romaji);
    assert.equal(item.script, /[ぁ-ゖ]/.test(item.kana) ? (/[ァ-ヶ]/.test(item.kana) ? 'mixed' : 'hiragana') : 'katakana');
    const url = new URL(item.sourceUrl);
    assert.equal(url.hostname, 'www.db.yugioh-card.com');
    assert.equal(url.searchParams.get('cid'), String(item.cid));
    assert.equal(url.searchParams.get('request_locale'), 'ja');
    assert.equal(new URL(item.imageSource).searchParams.get('request_locale'), 'ja');
    assert.equal(new URL(item.imageSource).searchParams.get('cid'), String(item.cid));
    assert.match(item.checkedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(item.image, /^cards\/\d+\.(png|jpg)$/);
    const bytes = fs.readFileSync(path.join(__dirname, item.image));
    assert.ok(bytes.length > 1000);
    if (item.image.endsWith('.png')) {
      assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      assert.ok(bytes.readUInt32BE(16) >= 190);
      assert.ok(bytes.readUInt32BE(20) >= 280);
    } else assert.equal(bytes.subarray(0, 2).toString('hex'), 'ffd8');
  }
  assert.equal(rows.reduce((total, row) => total + row.count, 0), 500);
  assert.equal(data.filter(item => item.meaningSource).length, 476);
  assert.ok(data.filter(item => item.meaningSource).every(item => item.meaningSource.includes('/09bf7de82e00b5b7660b517fc3ac099c746ce233/')));
});

test('每个词独立提供三个易混读音，单个错词重考仍有四个不同选项', () => {
  for (const item of data) {
    assert.equal(item.distractors.length, 3);
    const choices = makeReadingChoices(item, [item]);
    assert.equal(choices.length, 4);
    assert.equal(new Set(choices).size, 4);
    assert.equal(choices.filter(value => value === item.romaji).length, 1);
    assert.ok(choices.every(reading => reading === item.romaji || item.distractors.includes(reading)));
  }
});

test('游戏王每局20题，词汇和卡面都不重复，并包含两种假名', () => {
  for (const random of [() => 0, () => .999999, Math.random]) {
    const deck = makeDeck(data, 20, random);
    assert.equal(deck.length, 20);
    assert.equal(new Set(deck.map(item => item.kana)).size, 20);
    assert.equal(new Set(deck.map(item => item.cid)).size, 20);
    assert.ok(new Set(deck.map(item => item.script)).size >= 2);
  }
});

test('选组和错词重考只出现选中的词，不重复补足20题', () => {
  for (const row of rows) {
    const pool = data.filter(item => item.row === row.id);
    const deck = makeDeck(pool);
    assert.equal(deck.length, Math.min(20, pool.length));
    assert.equal(new Set(deck.map(item => item.kana)).size, Math.min(20, pool.length));
    assert.ok(deck.every(item => item.row === row.id));
  }
  assert.equal(makeDeck([data[0], data[0]]).length, 1);
});

test('500张题库连续抽取1000轮，每轮20张，卡片与目标词都不重复', () => {
  for (let i = 0; i < 1000; i++) {
    const deck = makeDeck(data);
    assert.equal(deck.length, 20);
    assert.equal(new Set(deck.map(item => item.cid)).size, 20);
    assert.equal(new Set(deck.map(item => item.kana)).size, 20);
  }
});

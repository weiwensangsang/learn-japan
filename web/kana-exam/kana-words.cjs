// 把官方已标出的假名拆成认读单位；不推断汉字读法。
const basic = {};
const add = (kana, readings) => [...kana].forEach((char, i) => { basic[char] = readings.split(' ')[i]; });
add('あいうえお', 'a i u e o'); add('かきくけこ', 'ka ki ku ke ko');
add('さしすせそ', 'sa shi su se so'); add('たちつてと', 'ta chi tsu te to');
add('なにぬねの', 'na ni nu ne no'); add('はひふへほ', 'ha hi fu he ho');
add('まみむめも', 'ma mi mu me mo'); add('やゆよ', 'ya yu yo');
add('らりるれろ', 'ra ri ru re ro'); add('わをん', 'wa o n');
add('がぎぐげご', 'ga gi gu ge go'); add('ざじずぜぞ', 'za ji zu ze zo');
add('だぢづでど', 'da ji zu de do'); add('ばびぶべぼ', 'ba bi bu be bo');
add('ぱぴぷぺぽ', 'pa pi pu pe po'); add('ぁぃぅぇぉゔ', 'a i u e o vu');
const compounds = {};
for (const [kana, prefix] of Object.entries({き:'ky',ぎ:'gy',し:'sh',じ:'j',ち:'ch',ぢ:'j',に:'ny',ひ:'hy',び:'by',ぴ:'py',み:'my',り:'ry'})) {
  for (const [small, vowel] of [['ゃ','a'],['ゅ','u'],['ょ','o']]) compounds[kana + small] = prefix + vowel;
}
Object.assign(compounds, {'しぇ':'she','じぇ':'je','ちぇ':'che','てぃ':'ti','でぃ':'di','とぅ':'tu','どぅ':'du','てゅ':'tyu','でゅ':'dyu','ふぁ':'fa','ふぃ':'fi','ふぇ':'fe','ふぉ':'fo','ふゅ':'fyu','うぃ':'wi','うぇ':'we','うぉ':'wo','ゔぁ':'va','ゔぃ':'vi','ゔぇ':'ve','ゔぉ':'vo','ゔゅ':'vyu','つぁ':'tsa','つぃ':'tsi','つぇ':'tse','つぉ':'tso','くぁ':'kwa','くぃ':'kwi','くぇ':'kwe','くぉ':'kwo','くゎ':'kwa','ぐぁ':'gwa','ぐゎ':'gwa','すぃ':'si','ずぃ':'zi'});
const hira = char => char >= 'ァ' && char <= 'ヶ' ? String.fromCharCode(char.charCodeAt(0) - 0x60) : char;
compounds['ぢぇ'] = 'je';
function splitReading(kana) {
  const chars = [...kana], parts = [];
  for (let i = 0; i < chars.length; i++) {
    const char = hira(chars[i]), pair = char + hira(chars[i + 1] || '');
    if (compounds[pair]) { parts.push([chars[i] + chars[++i], compounds[pair]]); continue; }
    if (char === 'っ') { parts.push([chars[i], null]); continue; }
    if (char === 'ー') {
      const vowel = parts.at(-1)?.[1]?.match(/[aiueo]$/)?.[0];
      if (!vowel) throw Error('长音前不是元音：' + kana);
      parts.push([chars[i], vowel]); continue;
    }
    if (/^[・＝\s]$/.test(char)) { parts.push([chars[i], ' ']); continue; }
    if (!basic[char]) throw Error('暂不自动处理的假名：' + kana);
    parts.push([chars[i], basic[char]]);
  }
  for (let i = 0; i < parts.length; i++) {
    if (parts[i][1] === null) {
      const next = parts[i + 1]?.[1];
      if (!next || !/^[bcdfghjkpqrstvwz]/.test(next)) throw Error('暂不处理的促音位置：' + kana);
      parts[i][1] = next.startsWith('ch') ? 't' : next[0];
    }
    if (hira(parts[i][0]) === 'ん' && /^[aiueoy]/.test(parts[i + 1]?.[1] || '')) parts[i][1] = "n'";
  }
  return parts;
}
function scriptFor(kana) {
  const hasHira = /[ぁ-ゖ]/.test(kana), hasKata = /[ァ-ヶ]/.test(kana);
  return hasHira && hasKata ? 'mixed' : hasHira ? 'hiragana' : 'katakana';
}
function makeWordLesson(kana) {
  const parts = splitReading(kana), romaji = parts.map(part => part[1]).join('');
  const wrong = new Set();
  const change = (index, replacement) => {
    const alternative = parts.map((part, i) => i === index ? replacement : part[1]).join('');
    if (alternative !== romaji && alternative.trim()) wrong.add(alternative);
  };
  // 先考实际出现的促音/长音，再改变某一拍的读音。
  parts.forEach(([kana], i) => { if (kana === 'ー' || hira(kana) === 'っ') change(i, ''); });
  const swaps = {ka:'ga',ga:'ka',ki:'gi',gi:'ki',ku:'gu',gu:'ku',ke:'ge',ge:'ke',ko:'go',go:'ko',sa:'za',za:'sa',shi:'chi',chi:'shi',su:'zu',zu:'su',ta:'da',da:'ta',te:'de',de:'te',to:'do',do:'to',ha:'ba',ba:'pa',pa:'ha',hi:'bi',bi:'pi',pi:'hi',fu:'pu',pu:'bu',bu:'fu',he:'be',be:'pe',pe:'he',ho:'bo',bo:'po',po:'ho',tsu:'su',n:'so',na:'ma',ma:'na',ra:'ro',ro:'ra',ru:'re',re:'ru',ri:'ni',ni:'ri'};
  for (let i = 0; i < parts.length && wrong.size < 3; i++) if (swaps[parts[i][1]]) change(i, swaps[parts[i][1]]);
  for (let i = parts.length - 1; i >= 0 && wrong.size < 3; i--) {
    if (!/[aiueo]$/.test(parts[i][1])) continue;
    for (const vowel of ['a', 'i', 'u', 'e', 'o']) { change(i, parts[i][1].replace(/[aiueo]$/, vowel)); if (wrong.size >= 3) break; }
  }
  if (wrong.size < 3) throw Error('不足三个不同错误读音：' + kana);
  const notes = [];
  if (/[ッっ]/.test(kana)) notes.push('小ッ／っ在下一个辅音前停一拍，罗马字体现为辅音重复');
  if (kana.includes('ー')) notes.push('ー把前一个音的元音延长一拍');
  if (/[ャュョゃゅょ]/.test(kana)) notes.push('小ゃ／ゅ／ょ和前一个字合读');
  if (/[ァィゥェォ]/.test(kana)) notes.push('小元音要结合前一个假名读，按下面的拆音认读');
  if (parts.some(part => part[1] === "n'")) notes.push("n'用撇号隔开后面的元音或y音");
  return { parts, romaji, distractors: [...wrong].slice(0, 3), note: (notes.length ? notes.join('；') : '按下面的拆音，把假名逐段连读') + '。' };
}
module.exports = { splitReading, scriptFor, makeWordLesson };

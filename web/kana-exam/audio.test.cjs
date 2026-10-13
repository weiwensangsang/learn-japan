const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const lessons = require('./yugioh-lessons.json');

test('500张卡一一对应离线日语音频，内容与生成清单一致', () => {
  const manifest = require('./audio-manifest.json');
  assert.equal(manifest.clips.length, lessons.length);
  assert.equal(new Set(manifest.clips.map(c => c.cid)).size, 500);
  for (const item of lessons) {
    const clip = manifest.clips.find(c => c.cid === item.cid);
    assert.equal(clip.kana, item.kana);
    assert.equal(clip.file, `audio/${item.cid}.ogg`);
    assert.ok(clip.seconds > .2 && clip.seconds < 30, item.kana);
    const bytes = fs.readFileSync(path.join(__dirname, clip.file));
    assert.equal(bytes.subarray(0, 4).toString(), 'OggS');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), clip.sha256);
    assert.equal(clip.pcmFile, `audio/${item.cid}.wav`);
    const pcm = fs.readFileSync(path.join(__dirname, clip.pcmFile));
    assert.equal(pcm.subarray(0, 4).toString(), 'RIFF');
    assert.equal(pcm.subarray(8, 12).toString(), 'WAVE');
    assert.equal(pcm.readUInt16LE(20), 1); // Linear PCM, no codec needed.
    assert.equal(pcm.readUInt16LE(22), 1); // Mono.
    assert.equal(pcm.readUInt32LE(24), 24000);
    assert.equal(pcm.readUInt16LE(34), 16);
    assert.equal(createHash('sha256').update(pcm).digest('hex'), clip.pcmSha256);
  }
  assert.match(fs.readFileSync(path.join(__dirname, 'audio/LICENSE-Mei.txt'), 'utf8'), /Attribution 3.0/);
});

test('播放错误区分权限、格式与网络，正常取消不会报播放失败', () => {
  const { audioFailure } = require('./core.js');
  assert.equal(audioFailure({ name: 'AbortError' }), '');
  assert.match(audioFailure({ name: 'NotAllowedError' }), /播放器里的/);
  assert.match(audioFailure({ name: 'NotSupportedError' }), /解码/);
  assert.match(audioFailure({ code: 2 }), /读取中断/);
});

(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const { makeDeck, makeCardExamDeck, makeReadingChoices, score, explainWord, compareReading, audioFailure } = window.KanaCore;
  const sets = window.KANA_SETS;
  const roundSize = 20;
  const requestedScript = new URLSearchParams(location.search).get('script');
  let activeScript = Object.hasOwn(sets, requestedScript) ? requestedScript : 'hiragana';
  let activePractice = new URLSearchParams(location.search).get('mode') === 'exam' ? 'exam' : 'study';
  const selections = Object.fromEntries(Object.entries(sets).map(([key, set]) => [key, new Set(set.rows.map(row => row.id))]));
  // 沿用旧键，旧记录补记为平假名；各题库分别展示和清除。
  const storageKey = 'learn-japan.kana.round20-history.v1';
  let session = null, timer = null, japaneseVoice = null, history = loadHistory();
  let currentAudio = null, speechId = 0;
  const currentSet = () => sets[activeScript];
  const selectedRows = () => selections[activeScript];
  const isCardMode = () => activeScript === 'yugioh';
  const isCardExam = () => isCardMode() && activePractice === 'exam';
  const recordGroup = record => record.script + (record.script === 'yugioh' ? record.assisted ? ':study' : ':exam' : '');
  const activeHistoryGroup = () => recordGroup({ script: activeScript, assisted: isCardMode() && !isCardExam() });
  function updateUrl() {
    try { const url = new URL(location.href); url.searchParams.set('script', activeScript); if (isCardMode()) url.searchParams.set('mode', activePractice); else url.searchParams.delete('mode'); window.history.replaceState(null, '', url); } catch { /* 本地文件仍可切换。 */ }
  }
  function loadHistory() {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) || '[]');
      return Array.isArray(parsed) ? parsed.filter(h => h && Number.isInteger(h.correct) && Number.isInteger(h.total) && h.total > 0 && h.correct >= 0 && h.correct <= h.total && Number.isFinite(h.date) && (h.script === undefined || Object.hasOwn(sets, h.script))).map(h => ({ ...h, script: h.script || 'hiragana' })).slice(0, (Object.keys(sets).length + 1) * 10) : [];
    } catch { return []; }
  }
  function saveHistory() { try { localStorage.setItem(storageKey, JSON.stringify(history)); } catch { /* 禁用存储时仍可考试。 */ } }
  function showView(view) { for (const id of ['setup', 'quiz', 'results']) $(id).hidden = id !== view; }
  function escapeText(value) { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
  function splitReading(item) {
    return item.parts.map(([, reading]) => reading.trim()).filter(Boolean).join(' · ');
  }
  function partsHtml(item) {
    return item.parts.map(([kana, reading]) => `<span><b lang="ja">${escapeText(kana)}</b><small>${escapeText(reading.trim() || '不发音')}</small></span>`).join('');
  }
  function rulesHtml(item) {
    return explainWord(item).map(rule => `<div class="reading-rule"><h4>${escapeText(rule.title)}</h4><p class="rule-example">${rule.examples.map(escapeText).join('；')}</p><p>${escapeText(rule.explanation)}</p></div>`).join('');
  }
  function comparisonHtml(comparison) {
    const labels = { correct: '正确', wrong: '写错', missing: '漏写', extra: '多写' };
    return '<p class="comparison-legend">逐段对照：绿色＝正确，红色＝写错／多写，虚线空格＝漏写。</p><div class="reading-comparison">' + comparison.parts.map(part => `<div class="comparison-part ${part.status}"><b lang="ja">${escapeText(part.kana)}</b><small>应读 ${escapeText(part.expected || '不发音')}</small><span class="comparison-actual">${part.status === 'separator' ? '不发音' : part.segments.map(s => `<span class="letter-${s.status}" title="${labels[s.status]}${s.expected ? '，应为 ' + escapeText(s.expected) : ''}" aria-label="${labels[s.status]}${s.actual ? ' ' + escapeText(s.actual) : ''}${s.expected ? '，应为 ' + escapeText(s.expected) : ''}">${escapeText(s.actual || '＿')}</span>`).join('')}</span><small class="part-status">${part.status === 'correct' ? '✓ 正确' : part.status === 'separator' ? '分隔符' : [...new Set(part.segments.filter(s => s.status !== 'correct').map(s => labels[s.status]))].join('、')}</small></div>`).join('') + '</div>';
  }
  function updateSelection() {
    const pool = currentSet().data.filter(k => selectedRows().has(k.row));
    const count = Math.min(roundSize, new Set(pool.map(item => item.kana)).size);
    const unit = isCardMode() ? '词' : '字';
    $('selection-count').textContent = isCardMode() ? `已选 ${selectedRows().size} 组 · ${pool.length} 张卡 / 共 ${currentSet().data.length} 张` : `已选 ${selectedRows().size} 行 · ${pool.length} 个假名`;
    $('start').disabled = !pool.length || (isCardExam() && count < roundSize);
    $('round-count').textContent = `${isCardExam() ? roundSize : count} 题`;
    $('setup-note').textContent = isCardExam() ? (count < roundSize ? '考试固定20题，所选范围不足20张，请多选一些分组。' : '随机抽取20张不同卡片。提交后进入下一题，第20题后统一显示成绩、读音和解释。') : count ? (count < roundSize ? `所选共 ${count} 个${unit}，本轮出 ${count} 题。` : `随机抽取 ${count} 个${unit}。`) + (isCardMode() ? '同一局词汇和卡面都不重复。输入读音后逐段检查，看完解释再点下一张。' : `同一局每个字只出一次，答完第 ${count} 题自动判卷。`) : `请至少选择一${isCardMode() ? '组词汇' : '行假名'}。`;
    for (const button of $('row-options').children) button.setAttribute('aria-pressed', String(selectedRows().has(button.dataset.row)));
  }
  function renderSetup() {
    const set = currentSet();
    const cardMode = isCardMode();
    const examMode = isCardExam();
    const sample = cardMode ? set.data[0] : set.data.find(item => item.kana === (activeScript === 'hiragana' ? 'く' : 'ク'));
    document.title = cardMode ? `第三关 · 游戏王${examMode ? '考试' : '学习'}` : `五十音 · ${set.label}认读考试`;
    $('practice-picker').hidden = !cardMode;
    for (const input of document.querySelectorAll('input[name="practice"]')) input.checked = input.value === activePractice;
    document.body.classList.toggle('card-mode', cardMode);
    $('header-note').textContent = cardMode ? `第三关 · 游戏王 · ${set.data.length} 张卡` : `${set.label} · ${set.data.length} 字`;
    $('card-mode-count').textContent = sets.yugioh ? `第三关 · ${sets.yugioh.data.length} 张卡` : '第三关 · 卡名与词汇';
    $('brand-mark').textContent = cardMode ? 'Ⅲ' : activeScript === 'hiragana' ? 'あ' : activeScript === 'katakana' ? 'ア' : 'あア';
    $('brand-mark').classList.toggle('mixed-mark', activeScript === 'mixed');
    $('intro-copy').textContent = cardMode ? '第三关：在游戏王卡名和卡片文本里，把熟悉的假名连成词。' : activeScript === 'mixed' ? '平假名与片假名混合随机出题，检查同一读音的两种字形。' : `一次一个字。用你自己的速记法，检查${set.label}的认和读。`;
    for (const input of document.querySelectorAll('input[name="script"]')) {
      input.checked = input.value === activeScript;
      input.disabled = !Object.hasOwn(sets, input.value);
    }
    $('example-character').textContent = sample.kana;
    $('practice-heading').textContent = cardMode ? examMode ? '独立输入，最后看结果' : '听读音，看解答，输入练习' : '看字，选读音';
    $('practice-description').textContent = cardMode ? examMode ? '一局20题，完成后统一判卷。' : '输入罗马字，逐段看哪里对、哪里错。' : '四个读音，选出正确的一个。';
    $('round-mode').textContent = cardMode ? `${examMode ? '考试' : '学习'}模式 · 输入读音` : '看字选读音 · 四选一';
    $('round-feedback').textContent = cardMode && !examMode ? '带解答 · 即时检查' : '全部答完再判卷';
    $('example-copy').textContent = cardMode ? examMode ? '看卡面和标出的假名，输入罗马字后提交。考试中不显示对错与解答；答完20题，再一起听读音、看拆音和符号解释。' : '每题可听日语读音，直接带中文意思、假名拆音和符号解释。输入后点“检查读音”或按 Enter，查看写对、写错、漏写和多写的位置；看完再点下一张。' : `例如看到「${sample.kana}」，选择 ku。点选即可提交，也可按数字键 1–4。`;
    $('preview-label').textContent = cardMode ? '从熟悉的卡名开始' : '你选定的记忆线索';
    $('preview-note').textContent = cardMode ? examMode ? '20题后统一看解答、听读音' : '每题都有解答、读音与符号解释' : '答完后，再看速记提示';
    $('preview-image').hidden = !cardMode;
    if (cardMode) { $('preview-image').src = sample.image; $('preview-image').alt = sample.cardName + '日文卡面'; }
    $('card-attribution').hidden = !cardMode;
    $('audio-attribution').hidden = !cardMode;
    $('sample-kana').textContent = sample.kana;
    $('sample-reading').textContent = sample.romaji;
    $('sample-hint').textContent = cardMode ? sample.meaning + '。' + sample.hint : sample.hint;
    $('start').innerHTML = `${cardMode ? examMode ? '开始20题考试' : '开始学习' : `开始${set.label}考试`} <span aria-hidden="true">→</span>`;
    $('retry-wrong').textContent = cardMode ? '再练错词' : '只重考错字';
    $('row-options').replaceChildren();
    for (const row of set.rows) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'row-toggle'; button.dataset.row = row.id;
      button.innerHTML = escapeText(row.label) + (cardMode ? ` <span class="row-count">${set.data.filter(item => item.row === row.id).length}</span>` : '') + `<small lang="ja">${escapeText(row.kana)}</small>` + (row.alternate ? `<small lang="ja">${escapeText(row.alternate)}</small>` : '');
      button.addEventListener('click', () => { if (selectedRows().has(row.id)) selectedRows().delete(row.id); else selectedRows().add(row.id); updateSelection(); });
      $('row-options').append(button);
    }
    updateSelection(); renderHistory();
  }
  function refreshVoices() {
    const supported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
    japaneseVoice = supported ? speechSynthesis.getVoices().find(voice => /^ja(?:-|_|$)/i.test(voice.lang)) || null : null;
  }
  function stopSpeech() {
    speechId++;
    if (currentAudio) { currentAudio.pause(); currentAudio = null; }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }
  function preparePlayer(player, item, message) {
    player.dataset.cid = String(item.cid);
    player.preload = 'none';
    player.src = `api/pronunciation/${item.cid}`;
    const link = player.parentElement?.querySelector('a');
    if (link) link.href = player.src;
    const voiceLabel = 'Google 日语读音';
    player.setAttribute('aria-label', `${item.kana} 日语读音播放器`);
    player.onplay = () => { if (currentAudio !== player) { stopSpeech(); currentAudio = player; } };
    player.onplaying = () => { message.textContent = `正在${player.playbackRate < 1 ? '慢速' : ''}播放${voiceLabel}…`; };
    player.onended = () => { message.textContent = `${voiceLabel}播放完毕，可再次听或慢速听。`; };
    player.onpause = () => { if (currentAudio === player && !player.ended && player.currentTime > 0) message.textContent = '已暂停，可以继续播放。'; };
    player.onerror = () => {
      message.textContent = 'Google 在线读音暂时无法播放，请检查网络后重试。';
      console.warn('日语音频加载失败', { source: player.src, code: player.error?.code, message: player.error?.message });
    };
  }
  function speak(item, message, slow = false, player = $('word-audio')) {
    stopSpeech();
    const id = speechId;
    const update = text => { if (id === speechId) message.textContent = text; };
    if (item.cid) {
      const audio = player;
      if (audio.dataset.cid !== String(item.cid) || audio.error) preparePlayer(audio, item, message);
      currentAudio = audio;
      audio.playbackRate = slow ? .75 : 1;
      audio.preservesPitch = true;
      if (audio.readyState >= 1) audio.currentTime = 0;
      update('正在连接 Google，加载日语读音…');
      audio.play().catch(error => {
        if (id !== speechId || error.name === 'AbortError') return;
        update(error.name !== 'NotAllowedError' ? 'Google 在线读音暂时无法播放，请检查网络后重试。' : audioFailure(error));
        console.warn('日语音频播放失败', { name: error.name, message: error.message, code: audio.error?.code, source: audio.src });
      });
      return;
    }
    refreshVoices();
    if (!japaneseVoice) { update('当前浏览器没有日语语音。'); return; }
    const utterance = new SpeechSynthesisUtterance(item.kana === 'を' ? 'お' : item.kana === 'ヲ' ? 'オ' : item.kana);
    utterance.lang = 'ja-JP'; utterance.voice = japaneseVoice; utterance.rate = slow ? .65 : .85;
    utterance.onstart = () => update('正在播放日语合成示范音…');
    utterance.onend = () => update('日语合成示范音，可再次播放。');
    utterance.onerror = event => { if (event.error !== 'canceled' && event.error !== 'interrupted') update('播放失败，请检查设备声音。'); };
    speechSynthesis.speak(utterance);
  }
  function renderHistory() {
    const records = history.filter(h => recordGroup(h) === activeHistoryGroup());
    const label = currentSet().label + (isCardMode() ? isCardExam() ? '考试' : '学习' : '');
    $('history-label').textContent = `${label}记录`;
    $('clear-history').setAttribute('aria-label', `清除${label}记录`);
    $('history').innerHTML = records.length ? records.slice(0, 4).map(h => `<div class="history-item"><div>${escapeText(sets[h.script].label)} · ${h.total} 题${h.assisted ? ' · 带解答输入' : h.inputMode ? ' · 输入考试' : ' · 四选一'}<small>${escapeText(new Date(h.date).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }))}</small></div><span class="history-score">${h.correct} / ${h.total}</span></div>`).join('') : '<p class="history-empty">还没有这个模式的记录。<br>从第一轮开始，留下自己的进步。</p>';
    $('clear-history').disabled = !records.length;
  }
  function stopTimer() { if (timer !== null) clearInterval(timer); timer = null; }
  function elapsed() { return Math.max(0, Math.floor((Date.now() - session.startedAt) / 1000)); }
  function formatDuration(seconds) { return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
  function startExam(override) {
    const pool = override?.pool || currentSet().data.filter(k => selectedRows().has(k.row));
    if (!pool.length) return;
    if (isCardExam() && new Set(pool.map(item => item.kana)).size < roundSize) { updateSelection(); return; }
    stopSpeech();
    session = { script: activeScript, inputMode: isCardMode(), assisted: isCardMode() && !isCardExam(), pool, deck: isCardExam() ? makeCardExamDeck(pool) : makeDeck(pool, roundSize), index: 0, answers: [], submitted: false, startedAt: Date.now(), finished: false };
    stopTimer(); timer = setInterval(() => { $('clock').textContent = formatDuration(elapsed()); }, 1000);
    $('clock').textContent = '00:00'; showView('quiz'); renderQuestion(); $('quiz').scrollIntoView({ block: 'start', behavior: 'auto' });
  }
  function renderQuestion() {
    stopSpeech();
    const item = session.deck[session.index], questionIndex = session.index;
    const cardMode = session.script === 'yugioh';
    session.submitted = false;
    $('quiz-label').textContent = `${sets[session.script].label}${cardMode ? session.assisted ? ' · 学习模式' : ' · 考试模式' : ''} / 本轮 ${session.deck.length} 题`;
    $('progress-label').textContent = `第 ${session.index + 1} / ${session.deck.length} 题`;
    $('progress-fill').style.width = `${session.index / session.deck.length * 100}%`;
    $('answer-form').hidden = false; $('sound-message').textContent = ''; $('choices').replaceChildren();
    $('quiz').classList.toggle('yugioh-quiz', cardMode);
    $('quiz').classList.toggle('long-word', cardMode && item.kana.length > 7);
    $('card-context').hidden = !cardMode;
    $('word-context').hidden = !cardMode;
    $('word-guide').hidden = !session.assisted;
    $('pronunciation').hidden = !session.assisted;
    if (session.assisted) {
      preparePlayer($('word-audio'), item, $('sound-message'));
      $('open-audio').href = $('word-audio').src;
    } else {
      const player = $('word-audio'); player.onerror = null; player.removeAttribute('src'); player.removeAttribute('data-cid'); player.load();
    }
    $('reading-form').hidden = !cardMode;
    $('choices').hidden = cardMode;
    $('guided-feedback').hidden = true;
    $('reading-comparison').replaceChildren();
    $('skip').hidden = false;
    $('skip').textContent = session.assisted ? '先跳过，稍后再练' : '想不起来，跳过';
    $('question-instruction').textContent = cardMode ? session.assisted ? '看卡名和拆音，输入罗马字后检查。' : '输入标出词语的罗马字；本轮结束后统一看结果。' : `这个${session.script === 'mixed' ? '假名' : sets[session.script].label}怎么读？选出正确的罗马字。`;
    if (cardMode) {
      $('card-image').hidden = false;
      $('card-image-error').hidden = true;
      $('card-image').src = item.image;
      $('card-image').alt = item.cardName + '日文卡面（官方SAMPLE）';
      $('card-name').textContent = item.cardName;
      $('card-source').href = item.sourceUrl;
      $('context-label').textContent = { name: '日文卡名', reading: '卡名的假名读法', text: '卡片文本摘录' }[item.sourceKind];
      $('context-text').innerHTML = item.context.split(item.kana).map(escapeText).join(`<mark>${escapeText(item.kana)}</mark>`);
      $('guide-reading').textContent = session.assisted ? splitReading(item) : '';
      $('guide-meaning').textContent = session.assisted ? '中文意思：' + item.meaning : '';
      $('guide-parts').innerHTML = session.assisted ? partsHtml(item) : '';
      $('guide-rules').innerHTML = session.assisted ? rulesHtml(item) : '';
      $('guide-hint').textContent = session.assisted ? '认读提示：' + item.hint : '';
      $('check-reading').textContent = session.assisted ? '检查读音' : session.index + 1 === session.deck.length ? '提交并查看结果' : '提交，下一题';
      $('input-help').textContent = '长音重复元音，例如 カー → kaa。大小写、空格和连字符不影响判定。' + (session.assisted ? '' : '按 Enter 提交。');
      $('reading-input').value = '';
      $('reading-input').disabled = false;
      $('check-reading').disabled = false;
      $('input-message').textContent = '';
      $('next-card').textContent = session.index + 1 === session.deck.length ? '完成本轮，回看 →' : '下一张 →';
    }
    $('question').textContent = item.kana;
    if (cardMode) return;
    const readings = makeReadingChoices(item, sets[session.script].data);
    $('quiz').classList.toggle('long-choices', cardMode && readings.some(reading => reading.length > 12));
    readings.forEach((reading, index) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'choice reading-choice'; button.dataset.reading = reading;
      button.setAttribute('aria-label', `${index + 1}. ${reading}`);
      button.innerHTML = `<span class="choice-number">${index + 1}</span><span>${escapeText(reading)}</span>`;
      button.addEventListener('click', () => { if (session.index === questionIndex) submit(reading); });
      $('choices').append(button);
    });
  }
  function submit(value) {
    if (!session || session.submitted || session.finished) return;
    const item = session.deck[session.index], skipped = value === null;
    const comparison = session.inputMode && !skipped ? compareReading(item, value) : null;
    const correct = !skipped && (comparison ? comparison.correct : value === item.romaji);
    session.answers.push({ item, user: skipped ? '' : value, correct, skipped, comparison }); session.submitted = true;
    if (session.assisted) {
      $('reading-input').disabled = true; $('check-reading').disabled = true; $('skip').hidden = true;
      $('guided-feedback').hidden = false;
      $('edit-reading').hidden = correct || skipped;
      $('answer-feedback').textContent = skipped ? `已跳过。这题读 ${splitReading(item)}，可以继续看上面的拆音与解释。` : correct ? '✓ 全部写对了。可以再对照假名读一遍，然后继续。' : `还差一点：正确读音是 ${splitReading(item)}。下面标出了写错、漏写或多写的部分。`;
      $('reading-comparison').innerHTML = comparison ? comparisonHtml(comparison) : '';
      $('guided-feedback').scrollIntoView({ block: 'nearest', behavior: 'auto' });
      return;
    }
    nextQuestion();
  }
  function nextQuestion() {
    if (!session || !session.submitted || session.finished) return;
    if (session.index + 1 === session.deck.length) { finish(); return; }
    session.index++; renderQuestion();
    if (session.inputMode) $('quiz').scrollIntoView({ block: 'start', behavior: 'auto' });
  }
  function finish() {
    if (!session || session.finished || session.answers.length !== session.deck.length) return;
    session.finished = true; session.seconds = elapsed(); stopTimer();
    stopSpeech();
    const result = score(session.answers); session.result = result; showView('results');
    $('result-label').textContent = `${sets[session.script].label} · ${session.assisted ? '本轮学习记录' : '本轮成绩'}`;
    $('results').querySelector('h2').textContent = session.assisted ? '这一轮，边看边读。' : '这一轮，认出了多少？';
    $('score').textContent = result.correct; $('score-total').textContent = `/ ${result.total}`;
    $('accuracy').textContent = `${session.assisted ? '输入正确率' : '正确率'} ${Math.round(result.correct / result.total * 100)}%`;
    $('duration').textContent = `用时 ${formatDuration(session.seconds)}`;
    $('mode-result').textContent = `${sets[session.script].label} · ${session.assisted ? '学习 · 带解答输入' : session.inputMode ? '考试 · 独立输入' : '四选一'}`;
    $('result-note').textContent = `正确 ${result.correct} 题 · 错误 ${result.wrong.length} 题（含跳过）。` + (session.assisted ? '这是看解答的练习记录，不代表已经独立记住。下面保留逐段对照和符号解释。' : '下面逐题显示答案与对照分析。');
    $('retry-wrong').disabled = !result.wrong.length; $('wrong-only').checked = false; renderReview();
    history = [{ script: session.script, assisted: session.assisted, inputMode: session.inputMode, date: Date.now(), correct: result.correct, total: result.total, seconds: session.seconds }, ...history.filter(h => recordGroup(h) === recordGroup(session)).slice(0, 9), ...history.filter(h => recordGroup(h) !== recordGroup(session))];
    saveHistory(); renderHistory(); $('results').scrollIntoView({ block: 'start', behavior: 'auto' });
  }
  function analysisFor(answer) {
    if (answer.item.cid) return `${answer.correct ? '这次输入正确' : answer.skipped ? '这题跳过了' : '你输入了 ' + answer.user}。${answer.item.kana} → ${splitReading(answer.item)}。意思是：${answer.item.meaning}。`;
    if (answer.correct) return `这次选对了：${answer.item.kana} 的读音是 ${answer.item.romaji}。`;
    if (answer.skipped) return `这题跳过了。先用下面的速记线索找回 ${answer.item.kana} → ${answer.item.romaji}。`;
    const candidates = sets[answer.item.script].data.filter(k => k.romaji === answer.user);
    const target = answer.item.kana, pair = [target, ...candidates.map(k => k.kana)];
    const contrasts = [
      ['さ', 'き', 'さ 上面一横，き 上面两横。'], ['く', 'こ', 'く 是尖角嘴，こ 是上下两道弯。'],
      ['る', 'ろ', 'る 的底部有卷尾圈，ろ 没有卷尾圈。'], ['ぬ', 'め', 'ぬ 的右下有小圈，め 没有末尾小圈。'],
      ['は', 'ほ', '看右边：は 一横，ほ 两横。'], ['あ', 'お', 'お 的右上有独立小笔，あ 没有那一小笔。'],
      ['ク', 'ケ', 'ク 右上只有转折；ケ 的右上多一横。'], ['ワ', 'ウ', 'ウ 顶上有独立的一小笔，ワ 没有。'],
      ['フ', 'ワ', 'ワ 左上有短竖，フ 没有。'], ['ヌ', 'ス', 'ヌ 的两笔在中间相交，ス 的短笔从右下伸出。'],
    ];
    let contrast = contrasts.find(([a, b]) => pair.includes(a) && pair.includes(b))?.[2] || '';
    if (pair.filter(k => ['ね', 'れ', 'わ'].includes(k)).length > 1) contrast = '看右边末尾：ね 收小圈，れ 伸出尾巴，わ 鼓大肚。';
    const other = candidates.map(k => k.kana).join('／');
    return `你选了 ${answer.user}${other ? '（对应 ' + other + '）' : ''}；当前字 ${target} 应读 ${answer.item.romaji}。${contrast ? '对照：' + contrast : '下面的速记提示可以帮助区分。'}`;
  }
  function renderReview() {
    const answers = $('wrong-only').checked ? session.answers.filter(answer => !answer.correct) : session.answers;
    const container = $('review'); container.replaceChildren();
    if (!answers.length) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = '这轮没有错题，可以取消“只看错题”回看全部答案。'; container.append(p); return; }
    for (const answer of answers) {
      const wrapper = document.createElement('div'); wrapper.className = 'review-item';
      wrapper.innerHTML = `<div class="review-kana" lang="ja">${escapeText(answer.item.kana)}</div><div><div class="review-reading">正确读音：${escapeText(answer.item.romaji)}${['を', 'ヲ'].includes(answer.item.kana) ? '（常写 wo）' : ''}</div><div class="review-user">${answer.skipped ? '已跳过' : `你的回答：${escapeText(answer.user)}`}</div><p class="review-analysis">${escapeText(analysisFor(answer))}</p><div class="review-hint">速记：${escapeText(answer.item.hint)}</div></div><div><span class="badge ${answer.correct ? '' : 'wrong'}">${answer.correct ? '正确' : '错误' + (answer.skipped ? ' · 跳过' : '')}</span></div>`;
      if (answer.item.cid) {
        const item = answer.item;
        wrapper.querySelector('.review-reading').textContent = '分段读音：' + splitReading(item);
        wrapper.classList.add('word-review');
        wrapper.firstElementChild.innerHTML = `<img class="review-card" src="${escapeText(item.image)}" alt="${escapeText(item.cardName)}日文卡面" loading="lazy">`;
        const details = wrapper.children[1];
        details.insertAdjacentHTML('afterbegin', `<div class="review-word" lang="ja">${escapeText(item.kana)}</div><p class="review-card-name" lang="ja">${escapeText(item.cardName)}</p>`);
        details.insertAdjacentHTML('beforeend', `<div class="word-parts" aria-label="假名拆音">${item.parts.map(([kana, reading]) => `<span><b lang="ja">${escapeText(kana)}</b><small>${escapeText(reading.trim() || '不发音')}</small></span>`).join('')}</div><a class="source-link" href="${escapeText(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">官方日文卡页 ↗</a><span class="tiny"> · 核对于 ${escapeText(item.checkedAt)}</span>`);
        if (item.meaningSource) details.insertAdjacentHTML('beforeend', ` · <a class="source-link" href="${escapeText(item.meaningSource)}" target="_blank" rel="noopener noreferrer">中文卡名来源（社区） ↗</a>`);
        details.querySelector('.review-hint').textContent = '认读提示：' + item.hint;
        if (answer.comparison) details.insertAdjacentHTML('beforeend', comparisonHtml(answer.comparison));
        details.insertAdjacentHTML('beforeend', `<div class="reading-rules review-rules">${rulesHtml(item)}</div>`);
      }
      if (answer.item.cid || japaneseVoice) {
        const play = document.createElement('button'); play.type = 'button'; play.className = 'text-button'; play.textContent = answer.item.cid ? '▶ Google 读音' : '♫ 示范音'; play.setAttribute('aria-label', `听 ${answer.item.kana} 的示范读音`);
        const message = document.createElement('p'); message.className = 'tiny'; message.setAttribute('role', 'status');
        const slow = document.createElement('button'); slow.type = 'button'; slow.className = 'text-button'; slow.textContent = '慢速听'; slow.setAttribute('aria-label', `慢速听 ${answer.item.kana}`);
        let player;
        if (answer.item.cid) {
          const audioBox = document.createElement('div'); audioBox.className = 'review-audio';
          player = document.createElement('audio'); player.controls = true; player.preload = 'none';
          preparePlayer(player, answer.item, message);
          const link = document.createElement('a'); link.href = player.src; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.className = 'text-button'; link.textContent = '单独打开音频 ↗';
          audioBox.append(play, slow, player, link, message); wrapper.children[1].append(audioBox);
        } else wrapper.lastElementChild.append(play, slow, message);
        play.addEventListener('click', () => speak(answer.item, message, false, player)); slow.addEventListener('click', () => speak(answer.item, message, true, player));
      }
      container.append(wrapper);
    }
  }
  renderSetup(); refreshVoices();
  $('card-image').addEventListener('error', () => { $('card-image').hidden = true; $('card-image-error').hidden = false; });
  if ('speechSynthesis' in window) speechSynthesis.addEventListener('voiceschanged', refreshVoices);
  for (const input of document.querySelectorAll('input[name="script"]')) input.addEventListener('change', () => {
    activeScript = input.value;
    updateUrl();
    renderSetup();
  });
  for (const input of document.querySelectorAll('input[name="practice"]')) input.addEventListener('change', () => { activePractice = input.value; updateUrl(); renderSetup(); });
  $('select-all').addEventListener('click', () => { currentSet().rows.forEach(row => selectedRows().add(row.id)); updateSelection(); });
  $('clear-all').addEventListener('click', () => { selectedRows().clear(); updateSelection(); });
  $('start').addEventListener('click', () => startExam());
  $('skip').addEventListener('click', () => submit(null));
  $('reading-form').addEventListener('submit', event => {
    event.preventDefault();
    if (!session || session.finished || session.submitted || !session.inputMode || event.isComposing) return;
    const value = $('reading-input').value.trim();
    if (!value || !compareReading(session.deck[session.index], value).user) { $('input-message').textContent = '先输入读音，再检查；也可以选择跳过。'; $('reading-input').focus(); return; }
    $('input-message').textContent = ''; submit(value);
  });
  $('next-card').addEventListener('click', nextQuestion);
  $('play-word').addEventListener('click', () => { if (session?.assisted && !session.finished) speak(session.deck[session.index], $('sound-message')); });
  $('play-slow').addEventListener('click', () => { if (session?.assisted && !session.finished) speak(session.deck[session.index], $('sound-message'), true); });
  $('edit-reading').addEventListener('click', () => {
    if (!session || !session.assisted || !session.submitted || session.finished) return;
    session.answers.pop(); session.submitted = false;
    $('guided-feedback').hidden = true; $('reading-input').disabled = false; $('check-reading').disabled = false;
    $('skip').hidden = false; $('reading-input').focus();
  });
  $('exit').addEventListener('click', () => { stopTimer(); stopSpeech(); session.finished = true; showView('setup'); });
  $('wrong-only').addEventListener('change', () => { stopSpeech(); renderReview(); });
  $('retry-wrong').addEventListener('click', () => { const pool = [...new Map(session.result.wrong.map(answer => [answer.item.kana, answer.item])).values()]; if (session.inputMode) { activePractice = 'study'; updateUrl(); renderSetup(); } startExam({ pool }); });
  $('restart').addEventListener('click', () => startExam({ pool: session.pool }));
  $('back').addEventListener('click', () => { stopSpeech(); showView('setup'); });
  $('clear-history').addEventListener('click', () => { history = history.filter(h => recordGroup(h) !== activeHistoryGroup()); saveHistory(); renderHistory(); });
  document.addEventListener('keydown', event => {
    if (!session || session.finished || session.inputMode || event.isComposing || event.repeat) return;
    if (!session.submitted && /^[1-4]$/.test(event.key)) { const button = $('choices').children[Number(event.key) - 1]; if (button) { event.preventDefault(); button.click(); } }
  });
})();

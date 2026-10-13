(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const { makeDeck, makeReadingChoices, score } = window.KanaCore;
  const sets = window.KANA_SETS;
  const roundSize = 20;
  const requestedScript = new URLSearchParams(location.search).get('script');
  let activeScript = Object.hasOwn(sets, requestedScript) ? requestedScript : 'hiragana';
  const selections = Object.fromEntries(Object.entries(sets).map(([key, set]) => [key, new Set(set.rows.map(row => row.id))]));
  // 沿用旧键，旧记录补记为平假名；三种模式分别展示和清除。
  const storageKey = 'learn-japan.kana.round20-history.v1';
  let session = null, timer = null, japaneseVoice = null, history = loadHistory();
  const currentSet = () => sets[activeScript];
  const selectedRows = () => selections[activeScript];
  function loadHistory() {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) || '[]');
      return Array.isArray(parsed) ? parsed.filter(h => h && Number.isInteger(h.correct) && Number.isInteger(h.total) && h.total > 0 && h.correct >= 0 && h.correct <= h.total && Number.isFinite(h.date) && (h.script === undefined || Object.hasOwn(sets, h.script))).map(h => ({ ...h, script: h.script || 'hiragana' })).slice(0, 30) : [];
    } catch { return []; }
  }
  function saveHistory() { try { localStorage.setItem(storageKey, JSON.stringify(history)); } catch { /* 禁用存储时仍可考试。 */ } }
  function showView(view) { for (const id of ['setup', 'quiz', 'results']) $(id).hidden = id !== view; }
  function escapeText(value) { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
  function updateSelection() {
    const pool = currentSet().data.filter(k => selectedRows().has(k.row));
    $('selection-count').textContent = `已选 ${selectedRows().size} 行 · ${pool.length} 个假名`;
    $('start').disabled = !pool.length;
    $('setup-note').textContent = (pool.length > 0 && pool.length < roundSize ? `所选不足 ${roundSize} 个，会先遍历再随机重复，凑满 ${roundSize} 题。` : `随机抽取 ${roundSize} 个字，不重复。`) + `点选直接下一题，第 ${roundSize} 题答完自动判卷。`;
    for (const button of $('row-options').children) button.setAttribute('aria-pressed', String(selectedRows().has(button.dataset.row)));
  }
  function renderSetup() {
    const set = currentSet();
    const sample = set.data.find(item => item.kana === (activeScript === 'hiragana' ? 'く' : 'ク'));
    document.title = `五十音 · ${set.label}认读考试`;
    $('header-note').textContent = `${set.label} · ${set.data.length} 字`;
    $('brand-mark').textContent = activeScript === 'hiragana' ? 'あ' : activeScript === 'katakana' ? 'ア' : 'あア';
    $('brand-mark').classList.toggle('mixed-mark', activeScript === 'mixed');
    $('intro-copy').textContent = activeScript === 'mixed' ? '平假名与片假名混合随机出题，检查同一读音的两种字形。' : `一次一个字。用你自己的速记法，检查${set.label}的认和读。`;
    for (const input of document.querySelectorAll('input[name="script"]')) input.checked = input.value === activeScript;
    $('example-character').textContent = sample.kana;
    $('example-copy').textContent = `例如看到「${sample.kana}」，选择 ku。点选即可提交，也可按数字键 1–4。`;
    $('sample-kana').textContent = sample.kana;
    $('sample-reading').textContent = sample.romaji;
    $('sample-hint').textContent = sample.hint;
    $('start').innerHTML = `开始${set.label}考试 <span aria-hidden="true">→</span>`;
    $('row-options').replaceChildren();
    for (const row of set.rows) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'row-toggle'; button.dataset.row = row.id;
      button.innerHTML = escapeText(row.label) + `<small lang="ja">${escapeText(row.kana)}</small>` + (row.alternate ? `<small lang="ja">${escapeText(row.alternate)}</small>` : '');
      button.addEventListener('click', () => { if (selectedRows().has(row.id)) selectedRows().delete(row.id); else selectedRows().add(row.id); updateSelection(); });
      $('row-options').append(button);
    }
    updateSelection(); renderHistory();
  }
  function refreshVoices() {
    const supported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
    japaneseVoice = supported ? speechSynthesis.getVoices().find(voice => /^ja(?:-|_|$)/i.test(voice.lang)) || null : null;
  }
  function speak(item, message) {
    if (!japaneseVoice) { message.textContent = '当前浏览器没有日语语音。'; return; }
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(item.kana === 'を' ? 'お' : item.kana === 'ヲ' ? 'オ' : item.kana);
    utterance.lang = 'ja-JP'; utterance.voice = japaneseVoice; utterance.rate = .8;
    utterance.onstart = () => { message.textContent = '正在播放日语合成示范音…'; };
    utterance.onend = () => { message.textContent = '日语合成示范音，可再次播放。'; };
    utterance.onerror = event => { if (event.error !== 'canceled' && event.error !== 'interrupted') message.textContent = '播放失败，请检查设备声音。'; };
    speechSynthesis.speak(utterance);
  }
  function renderHistory() {
    const records = history.filter(h => h.script === activeScript);
    $('history-label').textContent = `${currentSet().label}记录`;
    $('clear-history').setAttribute('aria-label', `清除${currentSet().label}记录`);
    $('history').innerHTML = records.length ? records.slice(0, 4).map(h => `<div class="history-item"><div>${escapeText(sets[h.script].label)} · ${h.total} 题<small>${escapeText(new Date(h.date).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }))}</small></div><span class="history-score">${h.correct} / ${h.total}</span></div>`).join('') : '<p class="history-empty">还没有这个题库的记录。<br>从第一轮开始，留下自己的进步。</p>';
    $('clear-history').disabled = !records.length;
  }
  function stopTimer() { if (timer !== null) clearInterval(timer); timer = null; }
  function elapsed() { return Math.max(0, Math.floor((Date.now() - session.startedAt) / 1000)); }
  function formatDuration(seconds) { return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
  function startExam(override) {
    const pool = override?.pool || currentSet().data.filter(k => selectedRows().has(k.row));
    if (!pool.length) return;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    session = { script: activeScript, pool, deck: makeDeck(pool, roundSize), index: 0, answers: [], submitted: false, startedAt: Date.now(), finished: false };
    stopTimer(); timer = setInterval(() => { $('clock').textContent = formatDuration(elapsed()); }, 1000);
    $('clock').textContent = '00:00'; showView('quiz'); renderQuestion(); $('quiz').scrollIntoView({ block: 'start', behavior: 'auto' });
  }
  function renderQuestion() {
    const item = session.deck[session.index], questionIndex = session.index;
    session.submitted = false;
    $('quiz-label').textContent = `${sets[session.script].label} / ${roundSize} 题一局`;
    $('progress-label').textContent = `第 ${session.index + 1} / ${session.deck.length} 题`;
    $('progress-fill').style.width = `${session.index / session.deck.length * 100}%`;
    $('answer-form').hidden = false; $('sound-message').textContent = ''; $('choices').replaceChildren();
    $('question-instruction').textContent = `这个${session.script === 'mixed' ? '假名' : sets[session.script].label}怎么读？选出正确的罗马字。`;
    $('question').textContent = item.kana;
    makeReadingChoices(item, sets[session.script].data).forEach((reading, index) => {
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
    const item = session.deck[session.index], skipped = value === null, correct = !skipped && value === item.romaji;
    session.answers.push({ item, user: skipped ? '' : value, correct, skipped }); session.submitted = true;
    if (session.index + 1 === session.deck.length) { finish(); return; }
    session.index++; renderQuestion();
  }
  function finish() {
    if (!session || session.finished || session.answers.length !== session.deck.length) return;
    session.finished = true; session.seconds = elapsed(); stopTimer();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    const result = score(session.answers); session.result = result; showView('results');
    $('result-label').textContent = `${sets[session.script].label} · 本轮成绩`;
    $('score').textContent = result.correct; $('score-total').textContent = `/ ${result.total}`;
    $('accuracy').textContent = `正确率 ${Math.round(result.correct / result.total * 100)}%`;
    $('duration').textContent = `用时 ${formatDuration(session.seconds)}`;
    $('mode-result').textContent = `${sets[session.script].label} · 四选一`;
    $('result-note').textContent = `正确 ${result.correct} 题 · 错误 ${result.wrong.length} 题（含跳过）。下面逐题显示答案与对照分析。`;
    $('retry-wrong').disabled = !result.wrong.length; $('wrong-only').checked = false; renderReview();
    history = [{ script: session.script, date: Date.now(), correct: result.correct, total: result.total, seconds: session.seconds }, ...history.filter(h => h.script === session.script).slice(0, 9), ...history.filter(h => h.script !== session.script)];
    saveHistory(); renderHistory(); $('results').scrollIntoView({ block: 'start', behavior: 'auto' });
  }
  function analysisFor(answer) {
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
    if (!answers.length) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = '这轮没有错字，可以取消“只看错字”回看全部答案。'; container.append(p); return; }
    for (const answer of answers) {
      const wrapper = document.createElement('div'); wrapper.className = 'review-item';
      wrapper.innerHTML = `<div class="review-kana" lang="ja">${escapeText(answer.item.kana)}</div><div><div class="review-reading">正确读音：${escapeText(answer.item.romaji)}${['を', 'ヲ'].includes(answer.item.kana) ? '（常写 wo）' : ''}</div><div class="review-user">${answer.skipped ? '已跳过' : `你的回答：${escapeText(answer.user)}`}</div><p class="review-analysis">${escapeText(analysisFor(answer))}</p><div class="review-hint">速记：${escapeText(answer.item.hint)}</div></div><div><span class="badge ${answer.correct ? '' : 'wrong'}">${answer.correct ? '正确' : '错误' + (answer.skipped ? ' · 跳过' : '')}</span></div>`;
      if (japaneseVoice) {
        const play = document.createElement('button'); play.type = 'button'; play.className = 'text-button'; play.textContent = '♫ 示范音'; play.setAttribute('aria-label', `听 ${answer.item.kana} 的示范读音`);
        const message = document.createElement('p'); message.className = 'tiny'; message.setAttribute('role', 'status');
        play.addEventListener('click', () => speak(answer.item, message)); wrapper.lastElementChild.append(play, message);
      }
      container.append(wrapper);
    }
  }
  renderSetup(); refreshVoices();
  if ('speechSynthesis' in window) speechSynthesis.addEventListener('voiceschanged', refreshVoices);
  for (const input of document.querySelectorAll('input[name="script"]')) input.addEventListener('change', () => {
    activeScript = input.value;
    try { const url = new URL(location.href); url.searchParams.set('script', activeScript); window.history.replaceState(null, '', url); } catch { /* 直接打开本地文件时仍可切换。 */ }
    renderSetup();
  });
  $('select-all').addEventListener('click', () => { currentSet().rows.forEach(row => selectedRows().add(row.id)); updateSelection(); });
  $('clear-all').addEventListener('click', () => { selectedRows().clear(); updateSelection(); });
  $('start').addEventListener('click', () => startExam());
  $('skip').addEventListener('click', () => submit(null));
  $('exit').addEventListener('click', () => { stopTimer(); session.finished = true; showView('setup'); });
  $('wrong-only').addEventListener('change', renderReview);
  $('retry-wrong').addEventListener('click', () => startExam({ pool: [...new Map(session.result.wrong.map(answer => [answer.item.kana, answer.item])).values()] }));
  $('restart').addEventListener('click', () => startExam({ pool: session.pool }));
  $('back').addEventListener('click', () => { if ('speechSynthesis' in window) speechSynthesis.cancel(); showView('setup'); });
  $('clear-history').addEventListener('click', () => { history = history.filter(h => h.script !== activeScript); saveHistory(); renderHistory(); });
  document.addEventListener('keydown', event => {
    if (!session || session.finished || event.isComposing || event.repeat) return;
    if (!session.submitted && /^[1-4]$/.test(event.key)) { const button = $('choices').children[Number(event.key) - 1]; if (button) { event.preventDefault(); button.click(); } }
  });
})();

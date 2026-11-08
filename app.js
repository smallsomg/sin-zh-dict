/* 僧伽罗语-中文双语对照词典 · 前端引擎
   数据：data/shard_*.js（由 data/txt/dictionary.txt 经 build_data.ps1 生成）
   每行字段：[en, si, type, zh, status, note]
   方向：si-zh（僧→中） / zh-si（中→僧）
   说明：不新增、不改写词条释义；中文缺失时按原格式显示“待补”。 */
(function () {
  'use strict';

  /* ---------------- 数据装载 ---------------- */
  const ROWS = (typeof window !== 'undefined' && window.DICT_ROWS) ? window.DICT_ROWS : [];
  const DATA = ROWS.map(function (r) {
    return {
      en: r[0] || '', si: r[1] || '', type: r[2] || '',
      zh: r[3] || '', status: r[4] || '', note: r[5] || ''
    };
  });
  const MANIFEST = (typeof window !== 'undefined' && window.DICT_MANIFEST) ? window.DICT_MANIFEST : null;

  const TYPE_DESC = {
    'n.': '名词', 'a.': '形容词', 'adj.': '形容词', 'v.': '动词', 'vt.': '及物动词',
    'vi.': '不及物动词', 'vti.': '及物/不及物动词', 'vtr.': '及物动词', 'aux.': '助动词',
    'adv.': '副词', 'pron.': '代词', 'prep.': '介词', 'conj.': '连词', 'con.': '连词',
    'int.': '感叹词', 'pref.': '前缀', 'prefix.': '前缀', 'suf.': '后缀', 'suffix.': '后缀',
    'st.': '陈述', 'ph.': '短语', 'idiom.': '习语', 'abbr.': '缩写', 'pl.': '复数',
    'gram.': '语法', 'prop.': '专有名词', 'comb.': '组合形式', 'ex.': '例句',
    'ind.': '不变词', 'Inf.': '非正式', 'Oth.': '其他',
    'Law.': '法律', 'Civ.': '民事', 'Med.': '医学', 'Eco.': '经济',
    'Acc.': '会计', 'Bot.': '植物学', 'Che.': '化学', 'Mat.': '数学', 'Phy.': '物理学',
    'Soc.': '社会学', 'Aes.': '美学', 'Psy.': '心理学', 'Geo.': '地理学', 'Art.': '艺术',
    'Sta.': '统计学', 'Log.': '逻辑学', 'Sur.': '测量学', 'Ele.': '电子学', 'Mng.': '管理学',
    'Wea.': '气象'
  };

  const PAGE_SIZE = 20;
  const MAX_RESULTS = 12000;
  const state = {
    book: 'si-zh',
    page: 1,
    mode: 'fuzzy',
    prefix: '',
    sim: 60,
    statusFilter: '',
    query: '',
    lang: '',
    groups: [],
    hits: 0,
    suggestActive: -1,
    translatedHits: 0,
    truncated: 0,
    browse: false,
    browseCache: null,
    browseKey: '',
    panelBook: null,
    detailItem: null,
    detailBook: null,
    lastFocus: null,
    busy: false
  };

  const $ = (id) => document.getElementById(id);
  const normSi = (s) => String(s == null ? '' : s).replace(/\u200d|\u200c/g, '').replace(/\s+/g, ' ').trim();
  const normEn = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();
  const normZh = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();
  const detectLang = (q) =>
    /[\u4e00-\u9fff]/.test(q) ? 'zh' : (/[\u0d80-\u0dff]/.test(q) ? 'si' : 'en');
  /* 僧语宽松形：去掉依附元音符号与 virama，只剩辅音骨架。
     学生漏打一个元音符号时（如 කයනවා ↔ කියනවා）仍能命中。 */
  const foldSi = (s) => String(s == null ? '' : s)
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/[\u0dcf-\u0ddf\u0dca]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const escAttr = esc;
  const keyOf = (en, si) => normEn(en) + '\u0001' + normSi(si);

  /* 图标一律用内联 SVG：不依赖 emoji、不依赖新版 Unicode 字符，
     在缺少彩色 emoji 字体的系统上也不会显示成方框。 */
  const ICON_HEART = '<svg class="ico" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false"><path d="M12 20.1 4.9 13a4.6 4.6 0 0 1 6.5-6.5l.6.6.6-.6A4.6 4.6 0 0 1 19.1 13z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';
  const ICON_HEART_ON = '<svg class="ico" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false"><path d="M12 20.1 4.9 13a4.6 4.6 0 0 1 6.5-6.5l.6.6.6-.6A4.6 4.6 0 0 1 19.1 13z" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>';
  const ICON_SEARCH = '<svg class="empty-ico" viewBox="0 0 48 48" width="44" height="44" aria-hidden="true" focusable="false"><circle cx="21" cy="21" r="12" fill="none" stroke="currentColor" stroke-width="3"/><path d="M30 30 41 41" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/></svg>';
  const ICON_WARN = '<svg class="empty-ico" viewBox="0 0 48 48" width="44" height="44" aria-hidden="true" focusable="false"><path d="M24 7 44 41H4z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M24 19v10" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/><circle cx="24" cy="34.5" r="1.9" fill="currentColor"/></svg>';

  /* 释义增强层（data/extras.js 提供：多译法 / 语义说明 / 例句） */
  const ALTS = (typeof ZH_ALTS !== 'undefined' && ZH_ALTS) ? ZH_ALTS : null;
  const SEM_NOTES = (typeof ZH_SEMANTIC_NOTES !== 'undefined' && ZH_SEMANTIC_NOTES) ? ZH_SEMANTIC_NOTES : null;
  const EXAMPLES = (typeof ZH_EXAMPLES !== 'undefined' && ZH_EXAMPLES) ? ZH_EXAMPLES : null;
  const isMtItem = (item) => item.status === '机翻待校';
  function passStatus(item) {
    const f = state.statusFilter;
    if (!f) return true;
    if (f === 'pending') return !item.zh;
    if (f === 'mt') return isMtItem(item);
    return !!item.zh && !isMtItem(item);
  }

  /* ---------------- 数据预处理 ---------------- */
  const EN_LC = new Array(DATA.length);
  const SI_NORM = new Array(DATA.length);
  const ZH_LC = new Array(DATA.length);
  const SI_FOLD = new Array(DATA.length);
  const ZH_EXACT = new Map();
  let TRANSLATED = [];
  let VERIFIED = [];
  let VERIFIED_EXACT = 0;
  let FIRSTPASS_COUNT = 0;

  function mergeChinese() {
    let verified = 0, firstPass = 0, mt = 0, pending = 0;
    for (let i = 0; i < DATA.length; i++) {
      const item = DATA[i];
      item.en = String(item.en == null ? '' : item.en).trim();
      item.si = String(item.si == null ? '' : item.si).trim();
      item.type = String(item.type == null ? '' : item.type).trim() || '—';
      item.zh = String(item.zh == null ? '' : item.zh).trim();
      item.note = String(item.note == null ? '' : item.note).trim();
      item.status = String(item.status == null ? '' : item.status).trim();
      if (!item.zh) { pending++; continue; }
      if (item.status === '机翻待校') mt++;
      else if (item.status === '初校') firstPass++;
      else verified++;
    }
    return {
      verified: verified, firstPass: firstPass, mt: mt, pending: pending,
      total: verified + firstPass + mt
    };
  }

  function buildIndexes() {
    TRANSLATED = [];
    VERIFIED = [];
    VERIFIED_EXACT = 0;
    FIRSTPASS_COUNT = 0;
    for (let i = 0; i < DATA.length; i++) {
      const item = DATA[i];
      EN_LC[i] = normEn(item.en);
      SI_NORM[i] = normSi(item.si);
      SI_FOLD[i] = foldSi(item.si);
      ZH_LC[i] = normZh(item.zh);
      if (item.zh && !ZH_EXACT.has(item.zh)) ZH_EXACT.set(item.zh, i);
      if (item.zh) TRANSLATED.push(i);
      if (item.zh && !isMtItem(item)) {
        VERIFIED.push(i);
        if (item.status === '初校') FIRSTPASS_COUNT++;
        else VERIFIED_EXACT++;
      }
    }
  }

  /* ---------------- 相似度 / 匹配 ---------------- */
  function similarity(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 100;
    const m = a.length, n = b.length;
    if (Math.abs(m - n) > Math.max(3, Math.round(Math.max(m, n) * 0.55))) return 0;
    let prev = new Array(n + 1);
    let cur = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      cur[0] = i;
      const ai = a.charCodeAt(i - 1);
      for (let j = 1; j <= n; j++) {
        const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      }
      const tmp = prev; prev = cur; cur = tmp;
    }
    return Math.round((1 - prev[n] / Math.max(m, n)) * 100);
  }

  function matchOne(candidate, query, mode) {
    if (!candidate) return null;
    if (mode === 'exact') {
      return candidate === query ? { score: 100, label: '精确' } : null;
    }
    if (mode === 'startsWith') {
      if (candidate === query) return { score: 100, label: '精确' };
      return candidate.indexOf(query) === 0 ? { score: 90, label: '开头' } : null;
    }
    if (mode === 'contains') {
      if (candidate === query) return { score: 100, label: '精确' };
      if (candidate.indexOf(query) === 0) return { score: 90, label: '开头' };
      return candidate.indexOf(query) >= 0 ? { score: 80, label: '包含' } : null;
    }
    /* 模糊模式先给子串命中：中文单词（如「佛」「书」）藏在长释义里时，
       编辑距离会因长度差过大而失效，必须先按包含关系命中。 */
    const at = candidate.indexOf(query);
    if (at === 0) return { score: 94, label: '开头' };
    if (at > 0) return { score: 86, label: '包含' };
    const sim = similarity(candidate, query);
    return sim >= state.sim ? { score: sim, label: sim === 100 ? '精确' : '相似 ' + sim + '%' } : null;
  }

  function normalizeQuery(q, lang) {
    if (lang === 'zh') return normZh(q);
    if (lang === 'si') return normSi(q);
    return normEn(q);
  }

  function candidateAt(i, lang) {
    if (lang === 'zh') return ZH_LC[i];
    if (lang === 'si') return SI_NORM[i];
    return EN_LC[i];
  }

  /* ---------------- 检索 ---------------- */
  function collect(raw) {
    const lang = detectLang(raw);
    const q = normalizeQuery(raw, lang);
    const results = [];
    let hits = 0, translatedHits = 0, truncated = 0;
    if (!q) return { lang, results, hits, translatedHits, truncated };

    const qFold = lang === 'si' ? foldSi(q) : '';
    for (let i = 0; i < DATA.length; i++) {
      const item = DATA[i];
      if (state.prefix && item.type !== state.prefix) continue;
      if (!passStatus(item)) continue;
      let m = matchOne(candidateAt(i, lang), q, state.mode);
      if (!m && lang === 'si' && qFold.length >= 2 && SI_FOLD[i].indexOf(qFold) >= 0) {
        m = { score: 70, label: '僧语模糊' };
      }
      if (!m) continue;
      hits++;
      if (item.zh) translatedHits++;
      if (m.score >= 90 || results.length < MAX_RESULTS) {
        results.push({ item, index: i, score: m.score, label: m.label });
      } else {
        truncated++;
      }
    }

    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const za = a.item.zh ? 1 : 0, zb = b.item.zh ? 1 : 0;
      if (zb !== za) return zb - za;
      return SI_NORM[a.index].localeCompare(SI_NORM[b.index]) ||
        a.item.en.localeCompare(b.item.en);
    });
    return { lang, results, hits, translatedHits, truncated };
  }

  function groupOf(results, lang) {
    const groups = new Map();
    for (const r of results) {
      const item = r.item;
      let key, title;
      if (lang === 'en') {
        key = 'E|' + EN_LC[r.index];
        title = item.en;
      } else if (state.book === 'si-zh') {
        key = 'S|' + SI_NORM[r.index];
        title = item.si;
      } else {
        key = item.zh ? 'Z|' + ZH_LC[r.index] : 'P|' + r.index;
        title = item.zh || item.si;
      }
      if (!groups.has(key)) groups.set(key, { key, title, lang, items: [], best: r });
      const g = groups.get(key);
      g.items.push(r);
      if (r.score > g.best.score) g.best = r;
    }
    const arr = Array.from(groups.values());
    arr.sort((a, b) => {
      if (b.best.score !== a.best.score) return b.best.score - a.best.score;
      const za = a.best.item.zh ? 1 : 0, zb = b.best.item.zh ? 1 : 0;
      if (zb !== za) return zb - za;
      return String(a.title).localeCompare(String(b.title));
    });
    return arr;
  }

  /* ---------------- 收藏 ---------------- */
  function favId(item, book) {
    return [book, normEn(item.en), normSi(item.si), normZh(item.zh)].join('\u0001');
  }
  function getFavs(book) {
    try { return JSON.parse(localStorage.getItem('sizh_fav_' + book) || '[]'); }
    catch (e) { return []; }
  }
  function setFavs(book, list) {
    try {
      localStorage.setItem('sizh_fav_' + book, JSON.stringify(list.slice(0, 500)));
    } catch (e) { /* 隐私模式下忽略 */ }
    updateFavCounts();
  }
  function isFav(item, book) {
    const id = favId(item, book);
    return getFavs(book).some((f) => f.id === id);
  }
  function toggleFav(item, book) {
    const list = getFavs(book);
    const id = favId(item, book);
    const idx = list.findIndex((f) => f.id === id);
    if (idx >= 0) list.splice(idx, 1);
    else list.unshift({
      id, book, en: item.en, si: item.si, zh: item.zh || '', type: item.type,
      note: item.note || '', status: item.status || '', ts: Date.now()
    });
    setFavs(book, list);
    return idx < 0;
  }
  function updateFavCounts() {
    $('favCountSiZh').textContent = getFavs('si-zh').length;
    $('favCountZhSi').textContent = getFavs('zh-si').length;
  }
  function favKey(item) {
    return encodeURIComponent(favId(item, state.book));
  }
  function syncFavButtons(item) {
    const key = favKey(item);
    const active = isFav(item, state.book);
    document.querySelectorAll('.favorite-btn[data-fav-key]').forEach((btn) => {
      if (btn.dataset.favKey !== key) return;
      btn.classList.toggle('favorited', active);
      btn.innerHTML = active ? ICON_HEART_ON : ICON_HEART;
      btn.title = active ? '取消收藏' : '收藏';
    });
    if (state.detailItem && state.detailBook === state.book &&
        favId(state.detailItem, state.book) === favId(item, state.book)) {
      updateDetailFav();
    }
  }

  /* ---------------- 搜索历史 ---------------- */
  function getHistory() {
    try { return JSON.parse(localStorage.getItem('sizh_history') || '[]'); }
    catch (e) { return []; }
  }
  function addHistory(q, book, lang) {
    let list;
    try { list = getHistory().filter((h) => h.q !== q).slice(0, 19); } catch (e) { list = []; }
    list.unshift({ q, book, lang, ts: Date.now() });
    try { localStorage.setItem('sizh_history', JSON.stringify(list)); } catch (e) { /* ignore */ }
  }
  function renderHistory() {
    const el = $('historyList');
    const list = getHistory();
    if (!list.length) {
      el.innerHTML = '<li class="search-history-empty">暂无搜索记录</li>';
      return;
    }
    el.innerHTML = list.map((h, i) => {
      const dir = h.lang === 'zh' ? '中→僧' : (h.lang === 'si' ? '僧→中' : '英文');
      return `<li class="search-history-item" data-history-index="${i}" title="${escAttr(h.q)}">
        <span class="search-history-text">${esc(h.q)}</span>
        <span class="history-dir">${esc(dir)}</span>
        <button class="search-history-delete" data-delete-history="${i}" aria-label="删除这条历史">×</button>
      </li>`;
    }).join('');
  }
  function showHistory() {
    renderHistory();
    const box = $('historyBox');
    box.dataset.mode = 'history';
    box.style.display = 'block';
  }
  function showSuggestions() {
    const box = $('historyBox');
    box.dataset.mode = 'suggest';
    box.style.display = 'block';
  }
  function hideDropdown() {
    $('historyBox').style.display = 'none';
    $('suggestBox').innerHTML = '';
    state.suggestActive = -1;
  }
  function applyHistory(index) {
    const h = getHistory()[index];
    if (!h) return;
    $('searchInput').value = h.q;
    hideDropdown();
    if (h.book === 'si-zh' || h.book === 'zh-si') switchBook(h.book, true);
    runSearch(true);
  }
  function deleteHistory(index) {
    const list = getHistory();
    if (index < 0 || index >= list.length) return;
    list.splice(index, 1);
    try { localStorage.setItem('sizh_history', JSON.stringify(list)); } catch (e) { /* ignore */ }
    renderHistory();
  }

  /* ---------------- 联想词 ---------------- */
  let suggestTimer = null;
  let suggestSeq = 0;

  function buildSuggestions(raw) {
    const lang = detectLang(raw);
    const q = normalizeQuery(raw, lang);
    const exact = [], prefix = [], contains = [];
    if (!q) return { lang, indices: [] };
    for (let i = 0; i < DATA.length; i++) {
      const item = DATA[i];
      if (state.prefix && item.type !== state.prefix) continue;
      if (!passStatus(item)) continue;
      const cand = candidateAt(i, lang);
      if (!cand) continue;
      if (cand === q) {
        if (exact.length < 6) exact.push(i);
      } else if (cand.indexOf(q) === 0) {
        if (prefix.length < 8) prefix.push(i);
      } else if (cand.indexOf(q) >= 0) {
        if (contains.length < 8) contains.push(i);
      }
    }
    const seen = new Set();
    const out = [];
    for (const i of exact.concat(prefix, contains)) {
      if (seen.has(i)) continue;
      seen.add(i);
      out.push(i);
      if (out.length >= 8) break;
    }
    return { lang, indices: out };
  }

  function renderSuggestions(indices, raw, lang) {
    const box = $('suggestBox');
    if (!indices.length) {
      box.innerHTML = '';
      hideDropdown();
      return;
    }
    box.innerHTML = `<div class="suggestions-header"><span>推荐词条</span><span class="suggest-note">按“前缀＋包含”匹配</span></div>` +
      indices.map((i) => {
        const item = DATA[i];
        const head = lang === 'zh' ? (item.zh || '（待补）') : (lang === 'si' ? item.si : item.en);
        const sub = lang === 'zh'
          ? (item.si + ' · ' + item.en)
          : ((item.zh || '中文释义待补') + ' · ' + item.en);
        return `<div class="suggestion-item" role="button" tabindex="0" data-suggest-index="${i}" data-suggest-lang="${lang}">
          <span class="suggestion-word">${esc(head)}</span>
          <span class="suggestion-translations">${esc(sub)}</span>
          <span class="suggestion-prefix">${esc(item.type)}</span>
        </div>`;
      }).join('');
    state.suggestActive = -1;
    showSuggestions();
  }

  function onInput() {
    const raw = $('searchInput').value.trim();
    clearTimeout(suggestTimer);
    if (!raw) {
      $('suggestBox').innerHTML = '';
      showHistory();
      return;
    }
    const seq = ++suggestSeq;
    suggestTimer = setTimeout(() => {
      if (seq !== suggestSeq) return;
      const { lang, indices } = buildSuggestions(raw);
      if (seq !== suggestSeq) return;
      renderSuggestions(indices, raw, lang);
    }, 180);
  }

  function chooseSuggestion(index) {
    const item = DATA[index];
    if (!item) return;
    const lang = detectLang($('searchInput').value);
    const book = lang === 'zh' ? 'zh-si' : 'si-zh';
    switchBook(book, true);
    $('searchInput').value = lang === 'zh' ? (item.zh || item.si) : (lang === 'si' ? item.si : item.en);
    hideDropdown();
    runSearch(true);
  }

  /* 联想下拉键盘操作：↑/↓ 选择，Enter 采用，Esc 关闭 */
  function moveSuggest(delta) {
    const items = $('suggestBox').querySelectorAll('[data-suggest-index]');
    if (!items.length) return false;
    let i = state.suggestActive;
    if (i < 0) i = delta > 0 ? 0 : items.length - 1;
    else i = (i + delta + items.length) % items.length;
    state.suggestActive = i;
    for (let k = 0; k < items.length; k++) items[k].classList.toggle('active', k === i);
    return true;
  }
  function chooseActiveSuggestion() {
    const items = $('suggestBox').querySelectorAll('[data-suggest-index]');
    const el = items[state.suggestActive];
    if (!el) return false;
    chooseSuggestion(Number(el.dataset.suggestIndex));
    return true;
  }

  /* ---------------- 搜索主流程 ---------------- */
  function setBusy(busy) {
    state.busy = busy;
    const btn = $('searchBtn');
    btn.disabled = busy;
    btn.classList.toggle('busy', busy);
    const label = btn.querySelector('.search-btn-label');
    if (label) label.textContent = busy ? '搜索中' : '搜索';
  }

  function runSearch(record) {
    if (state.busy) return;
    const raw = $('searchInput').value.trim();
    if (!raw) { doSearchNow(record); return; }
    setBusy(true);
    setTimeout(() => {
      try { doSearchNow(record); }
      catch (err) {
        console.error(err);
        showToast('检索失败：' + (err && err.message ? err.message : err));
      } finally {
        setBusy(false);
      }
    }, 30);
  }

  function doSearchNow(record) {
    const raw = $('searchInput').value.trim();
    state.query = raw;
    state.page = 1;

    if (!raw) {
      state.groups = [];
      state.hits = 0;
      state.translatedHits = 0;
      state.truncated = 0;
      state.browse = !!(state.prefix || state.statusFilter || state.book === 'zh-si');
      if (state.browse) buildBrowseCache(true);
      else { state.browseCache = null; state.browseKey = ''; }
      updateSearchInfo();
      renderResults();
      return;
    }

    const { lang, results, hits, translatedHits, truncated } = collect(raw);
    state.lang = lang;
    state.hits = hits;
    state.translatedHits = translatedHits;
    state.truncated = truncated;
    state.browse = false;
    state.browseCache = null;
    state.browseKey = '';

    // 自动切换方向：中文查询进“中→僧”，僧语查询进“僧→中”
    if (lang === 'zh' && state.book !== 'zh-si') switchBook('zh-si', true);
    if (lang === 'si' && state.book !== 'si-zh') switchBook('si-zh', true);

    state.groups = groupOf(results, lang);
    if (record !== false) addHistory(raw, state.book, lang);
    updateSearchInfo();
    renderResults();
  }

  function setSummary(prefix, value, unit) {
    $('summaryText').textContent = prefix;
    $('resultCount').textContent = value;
    $('summaryUnit').textContent = unit;
  }

  function statusLabel(f) {
    if (f === 'verified') return '仅已校中文';
    if (f === 'mt') return '仅机翻待校';
    if (f === 'pending') return '仅待补中文';
    return '全部释义状态';
  }

  function updateSearchInfo() {
    const info = $('translationInfo');
    if (state.browse) {
      const typeText = state.prefix
        ? `词性/领域：${state.prefix}${TYPE_DESC[state.prefix] ? '（' + TYPE_DESC[state.prefix] + '）' : ''}`
        : '全部词性/领域';
      const zhText = state.book === 'zh-si'
        ? '中→僧：仅含有中文的词义'
        : statusLabel(state.statusFilter);
      const total = state.browseCache ? state.browseCache.length : 0;
      info.style.display = 'block';
      info.innerHTML = `<span class="info-dir">浏览模式</span>
        <span>${esc(typeText)}</span>
        <span>共 <b>${total.toLocaleString()}</b> 条词义</span>
        <span class="info-zh">${esc(zhText)}</span>`;
      return;
    }
    if (!state.query) { info.style.display = 'none'; return; }
    const dir = state.lang === 'zh' ? '中 → 僧' : (state.lang === 'si' ? '僧 → 中' : '英文 → 僧/中');
    let modeText = '包含匹配';
    if (state.mode === 'exact') modeText = '精确匹配';
    else if (state.mode === 'startsWith') modeText = '开头匹配';
    else if (state.mode === 'fuzzy') modeText = '模糊匹配 · 阈值 ' + state.sim + '%';
    const truncatedText = state.truncated > 0
      ? `<span class="info-mode">结果较多，仅展示前 ${state.groups.length.toLocaleString()} 个词头（共 ${state.hits.toLocaleString()} 条匹配）</span>`
      : '';
    const filterText = state.prefix
      ? `<span class="info-mode">词性筛选：${esc(state.prefix)}${TYPE_DESC[state.prefix] ? '（' + esc(TYPE_DESC[state.prefix]) + '）' : ''}</span>`
      : (state.statusFilter ? `<span class="info-mode">${esc(statusLabel(state.statusFilter))}</span>` : '');
    const zhHitsText = state.statusFilter === 'pending'
      ? `<span class="info-zh">其中待补中文 <b>${state.hits.toLocaleString()}</b> 条</span>`
      : `<span class="info-zh">其中已有中文 <b>${state.translatedHits.toLocaleString()}</b> 条</span>`;
    info.style.display = 'block';
    info.innerHTML = `<span class="info-dir">${dir}</span>
      <span>命中 <b>${state.hits.toLocaleString()}</b> 条词义 / <b>${state.groups.length.toLocaleString()}</b> 个词头</span>
      ${zhHitsText}
      <span class="info-mode">${modeText}</span>
      ${filterText}
      ${truncatedText}`;
  }

  /* ---------------- 渲染：结果 ---------------- */
  function statusBadge(item) {
    if (!item.zh) return '<span class="status-badge pending">待补</span>';
    if (isMtItem(item)) return '<span class="status-badge mt">机翻待校</span>';
    return `<span class="status-badge">${esc(item.status || '初校')}</span>`;
  }

  /* 可靠性标记：✓ 双来源已核实 / ○ 部分核实 / △ 机翻待校 */
  function relMark(item) {
    const key = String(item.en || '').toLowerCase() + '\u0001' +
      String(item.si || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const ov = (window.MARK_OVERRIDE || {})[key];
    if (ov) return ov;
    if (!item.zh) return 'T';
    if (item.status === '机翻待校') return 'T';
    if (item.status === '已校' && /已核实|术语库|T\d{3}|官方|外交部|新华社/.test(String(item.note || ''))) return 'V';
    return 'O';
  }

  function relMarkHtml(item) {
    const m = relMark(item);
    if (m === 'V') return '<span class="mk mk-v" title="双来源已核实：词形和释义都在权威资料中核对过。">✓</span>';
    if (m === 'T') return '<span class="mk mk-t" title="机翻待校：暂无可靠来源，供参考，须核对后使用。">△</span>';
    return '<span class="mk mk-p" title="部分核实：词形有出处，释义为通行译法，未逐条查证。">○</span>';
  }

  function primarySecondary(item, lang) {
    if (lang === 'zh') return [item.si, '英文：' + item.en];
    if (lang === 'en') return [item.zh || '中文释义待补', '僧语：' + item.si];
    if (state.book === 'si-zh') return [item.zh || '中文释义待补', '英文：' + item.en];
    return [item.si, '英文：' + item.en];
  }

  function headwordOf(item, lang) {
    if (lang === 'en') return item.en;
    if (lang === 'si' || state.book === 'si-zh') return item.si;
    return item.zh || '（中文释义待补）';
  }

  function subtitleOf(item, lang) {
    if (lang === 'en') return (item.zh || '中文释义待补') + ' · ' + item.si;
    if (lang === 'si' || state.book === 'si-zh') return item.zh || '中文释义待补';
    return item.si;
  }

  function mark(text, query, lang) {
    const src = String(text == null ? '' : text);
    const needle = String(query == null ? '' : query);
    if (!needle || lang === 'si') return esc(src);
    const hay = lang === 'en' ? src.toLowerCase() : src;
    const nee = lang === 'en' ? needle.toLowerCase() : needle;
    const i = hay.indexOf(nee);
    if (i < 0) return esc(src);
    return esc(src.slice(0, i)) + '<mark>' + esc(src.slice(i, i + needle.length)) + '</mark>' +
      esc(src.slice(i + needle.length));
  }

  function favButton(item, onclickExpr, active) {
    return `<button class="favorite-btn ${active ? 'favorited' : ''}" data-fav-key="${escAttr(favKey(item))}"
      onclick="${onclickExpr}" title="${active ? '取消收藏' : '收藏'}" aria-label="${active ? '取消收藏' : '收藏'}">${active ? ICON_HEART_ON : ICON_HEART}</button>`;
  }

  function renderEnglishDetail(item) {
    const bits = [];
    bits.push(`英文原词 <span class="en-word">${esc(item.en)}</span>`);
    bits.push(`<span class="type-chip">${esc(item.type)}</span>`);
    if (item.note) bits.push(`<div class="item-note">注：${esc(item.note)}</div>`);
    return `<details class="en-detail"><summary>英文原词 / 校订信息</summary><div class="en-body">${bits.join(' ')}</div></details>`;
  }

  /* 轻提示：只做一次淡入，不做装饰性动画 */
  let toastTimer = null;
  function toast(msg) {
    let el = document.getElementById('sizhToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'sizhToast';
      el.className = 'sizh-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { if (el && el.parentNode) el.parentNode.removeChild(el); }, 1600);
  }

  /* 三语同屏：英文｜僧伽罗｜中文，当前检索语种高亮；僧语词头带复制按钮 */
  function triLine(item, lang) {
    const cell = (k, v) => `<span class="tri-cell tri-${k}${k === lang ? ' hit' : ''}"${k === 'si' ? ' lang="si"' : ''}>${esc(v)}</span>`;
    const siBtn = item.si
      ? `<button class="copy-si" type="button" data-copy-si="${escAttr(item.si)}" title="复制僧伽罗语词头" aria-label="复制僧伽罗语词头">复制僧语</button>`
      : '';
    return `<div class="tri-line">${cell('en', item.en || '—')}<span class="tri-sep">｜</span>${cell('si', item.si || '—')}${siBtn}<span class="tri-sep">｜</span>${cell('zh', item.zh || '待补')}</div>`;
  }

  function renderItemLine(item, lang, favExpr, active, detailExpr) {
    const isPending = !item.zh;
    return `<div class="result-group-item">
      <div class="result-group-item-header">
        <div class="tri-wrap">
          ${triLine(item, lang)}
        </div>
        <div class="item-badges">
          <span class="type-chip">${esc(item.type)}</span>${statusBadge(item)}
          ${favButton(item, favExpr, active)}
        </div>
      </div>
      <div class="card-actions">
        <button class="link-btn primary" onclick="${detailExpr}">详情</button>
        ${isPending ? '<span class="empty-tip">中文释义待补</span>' : ''}
      </div>
      ${renderEnglishDetail(item)}
    </div>`;
  }

  function renderGroup(group, gi) {
    const count = group.items.length;
    const best = group.best.item;
    const allFav = group.items.every((r) => isFav(r.item, state.book));
    const isSingle = count === 1;
    const title = isSingle ? headwordOf(best, group.lang) : group.title;
    const subtitle = isSingle ? subtitleOf(best, group.lang) : Array.from(new Set(group.items.map((r) => {
      if (group.lang === 'zh') return r.item.si;
      if (state.book === 'zh-si') return r.item.si;
      return r.item.zh || '待补';
    }))).slice(0, 6).join('；');
    const itemHtml = group.items.map((r, ii) =>
      renderItemLine(r.item, group.lang, `toggleItemFav(${gi},${ii},this)`, isFav(r.item, state.book),
        `openGroupItem(${gi},${ii})`)
    ).join('');

    return `<div class="result-group" id="group-${gi}">
      <div class="result-group-header">
        <div class="result-group-main">
          <div class="result-group-title ${best.zh ? '' : 'pending'}">${mark(title, state.query, group.lang)}${isSingle ? relMarkHtml(best) : ''}</div>
          <div class="result-group-others">${esc(subtitle)}</div>
        </div>
        <div class="group-actions">
          <span class="result-group-count">${count} 个义项</span>
          ${isSingle ? '' : favButton(best, `toggleGroupFav(${gi},this)`, allFav)}
        </div>
      </div>
      ${isSingle ? `<div class="result-group-items single">${itemHtml}</div>` : `
        <button class="result-group-expand" onclick="toggleExpand(${gi})">展开查看 ${count} 个义项</button>
        <div class="result-group-items">${itemHtml}</div>`}
      <div class="result-match"><span class="score ${group.best.score >= 90 ? 'high' : (group.best.score >= 70 ? 'medium' : 'low')}">${esc(group.best.label)}</span></div>
    </div>`;
  }

  function renderBrowseCard(index, absoluteIndex) {
    const item = DATA[index];
    const pending = !item.zh;
    const zhBook = state.book === 'zh-si';
    const title = zhBook ? (item.zh || '（中文释义待补）') : item.si;
    const sub = zhBook ? item.si : (item.zh || '中文释义待补');
    return `<div class="result-group">
      <div class="result-group-header">
        <div class="result-group-main">
          <div class="result-group-title ${pending ? 'pending' : ''}">${esc(title)}${relMarkHtml(item)}</div>
          <div class="result-group-others">${esc(sub)}</div>
        </div>
        <div class="group-actions">
          <span class="type-chip">${esc(item.type)}</span>
          ${statusBadge(item)}
          ${favButton(item, `toggleBrowseFav(${absoluteIndex},this)`, isFav(item, state.book))}
        </div>
      </div>
      <div class="card-actions">
        <button class="link-btn primary" onclick="openBrowseItem(${absoluteIndex})">详情</button>
        <span class="empty-tip">英文：${esc(item.en)}</span>
      </div>
    </div>`;
  }

  function renderResults() {
    const list = $('resultsList');
    const pag = $('pagination');

    if (state.browse) {
      renderBrowse();
      return;
    }

    if (!state.query) {
      renderWelcome();
      pag.innerHTML = '';
      return;
    }

    const total = state.groups.length;
    setSummary('找到', total.toLocaleString(), '个词头');
    if (!total) {
      const filterHint = [
        state.prefix ? `词性/领域筛选：${esc(state.prefix)}${TYPE_DESC[state.prefix] ? '（' + esc(TYPE_DESC[state.prefix]) + '）' : ''}` : '',
        state.statusFilter ? `释义状态筛选：${esc(statusLabel(state.statusFilter))}` : ''
      ].filter(Boolean).join('；');
      list.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${ICON_SEARCH}</div>
        <p>未找到匹配结果</p>
        ${filterHint ? `<p class="empty-tip">当前启用了${filterHint}。</p>` : ''}
        <p class="empty-tip">可切换“包含匹配”或“模糊匹配”，或取消筛选。<br>
        <a href="#" onclick="resetAll(true);return false;">重置检索条件</a></p></div>`;
      pag.innerHTML = '';
      return;
    }
    const start = (state.page - 1) * PAGE_SIZE;
    const pageGroups = state.groups.slice(start, start + PAGE_SIZE);
    state.pageGroups = pageGroups;
    list.innerHTML = pageGroups.map((g, i) => renderGroup(g, start + i)).join('');
    renderPagination(total);
  }

  function renderWelcome() {
    setSummary('共', DATA.length.toLocaleString(), '条词义可检索');
    const covered = TRANSLATED.length;
    const verified = VERIFIED_EXACT;
    const firstPass = FIRSTPASS_COUNT;
    const mtCount = Math.max(0, covered - verified - firstPass);
    const pending = Math.max(0, DATA.length - covered);
    const pct = DATA.length ? (covered / DATA.length * 100).toFixed(1) : '0.0';
    const words = ['水', '法律', '疫苗', '血压', '货币', '原告', '仲裁', '宪法', '法院', '火', '土地', '空气'];
    const samples = [];
    const seen = new Set();
    words.forEach((w) => {
      const idx = ZH_EXACT.get(w);
      if (idx != null && !seen.has(idx)) { seen.add(idx); samples.push(idx); }
    });
    if (samples.length < 6) {
      for (const idx of VERIFIED) {
        if (samples.length >= 6) break;
        if (!seen.has(idx)) { seen.add(idx); samples.push(idx); }
      }
    }
    const chips = words.filter((w) => ZH_EXACT.has(w)).map((w) =>
      `<button class="chip" onclick="runQuickSearch('${escAttr(w)}')">${esc(w)}</button>`).join('');

    $('resultsList').innerHTML = `<div class="welcome-panel">
        <div class="welcome-main">
          <div class="welcome-eyebrow">Sinhala · Chinese</div>
          <h2>查一个词，或从已校条目开始</h2>
          <p>支持僧伽罗语、中文、英文三种输入。中文已覆盖 ${covered.toLocaleString()} 条（${pct}%）：
          已校 ${verified.toLocaleString()} 条可直接参考，初校 ${firstPass.toLocaleString()} 条已完成初校，机翻待校 ${mtCount.toLocaleString()} 条待复核，其余 ${pending.toLocaleString()} 条待补。
          中文反查随覆盖同步扩大；僧伽罗语与英文检索覆盖全部 ${DATA.length.toLocaleString()} 条词义。</p>
          <div class="quick-chips">${chips}</div>
          <div class="quick-actions">
            <button class="btn primary" onclick="quickBrowse('all')">浏览全部词条</button>
            <button class="btn" onclick="quickBrowse('zh')">只看已校中文</button>
            <button class="btn" onclick="quickBrowse('mt')">浏览机翻待校</button>
            <button class="btn" onclick="openRandomSample()">随机已校词条</button>
          </div>
        </div>
        <div class="coverage-card">
          <div class="coverage-title">中文释义覆盖</div>
          <div class="coverage-num">${pct}% <small>${covered.toLocaleString()} / ${DATA.length.toLocaleString()}</small></div>
          <div class="coverage-bar"><div class="coverage-fill" style="width:${Math.max(Number(pct), 1)}%"></div></div>
          <div class="coverage-note">已校 ${verified.toLocaleString()} 条 · 初校 ${firstPass.toLocaleString()} 条 · 机翻待校 ${mtCount.toLocaleString()} 条 · 待补 ${pending.toLocaleString()} 条。<br>
          未覆盖条目保持原文并标注“待补”，不生成未经来源支持的中文释义。</div>
        </div>
      </div>
      <div class="welcome-section-title"><h3>已校条目示例</h3><span>点击“详情”查看僧语、中文与英文对照</span></div>` +
      samples.map((idx) => {
        const item = DATA[idx];
        return `<div class="sample-card">
          <div class="sample-si">${esc(item.si)}</div>
          <div class="sample-zh">${esc(item.zh)}</div>
          <div class="sample-en">${esc(item.en)} · ${esc(item.type)}${TYPE_DESC[item.type] ? ' · ' + TYPE_DESC[item.type] : ''}</div>
          <div class="sample-foot">
            <span class="status-badge">${esc(item.status || '初校')}</span>
            <button class="link-btn" onclick="openSampleItem(${idx})">详情</button>
          </div>
        </div>`;
      }).join('');
  }

  function renderPagination(total) {
    const pages = Math.ceil(total / PAGE_SIZE);
    const pag = $('pagination');
    if (pages <= 1) { pag.innerHTML = ''; return; }
    let html = `<button class="page-btn" ${state.page === 1 ? 'disabled' : ''} onclick="goPage(${state.page - 1})">上一页</button>`;
    const around = 2;
    for (let p = 1; p <= pages; p++) {
      if (p === 1 || p === pages || Math.abs(p - state.page) <= around) {
        html += `<button class="page-btn ${p === state.page ? 'active' : ''}" onclick="goPage(${p})">${p}</button>`;
      } else if (Math.abs(p - state.page) === around + 1) {
        html += '<span class="page-ellipsis">…</span>';
      }
    }
    html += `<button class="page-btn" ${state.page === pages ? 'disabled' : ''} onclick="goPage(${state.page + 1})">下一页</button>`;
    pag.innerHTML = html;
  }

  /* ---------------- 渲染：浏览 ---------------- */
  function buildBrowseCache(force) {
    const key = [state.book, state.prefix, state.statusFilter || '0'].join('|');
    if (!force && state.browseCache && state.browseKey === key) return;
    const arr = [];
    for (let i = 0; i < DATA.length; i++) {
      const item = DATA[i];
      if (state.prefix && item.type !== state.prefix) continue;
      if (state.book === 'zh-si' && !item.zh) continue;
      if (!passStatus(item)) continue;
      arr.push(i);
    }
    if (state.book === 'zh-si') {
      arr.sort((a, b) => DATA[a].zh.localeCompare(DATA[b].zh, 'zh') || SI_NORM[a].localeCompare(SI_NORM[b]));
    }
    state.browseCache = arr;
    state.browseKey = key;
  }

  function renderBrowse() {
    const cache = state.browseCache || [];
    const total = cache.length;
    setSummary('浏览', total.toLocaleString(), '条词义');
    if (!total) {
      const emptyIcon = '<svg class="empty-state-icon" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" focusable="false"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>';
      $('resultsList').innerHTML = `<div class="empty-state">` + emptyIcon + `
        <p>该筛选下暂无可浏览词条</p>
        <p class="empty-tip"><a href="#" onclick="resetAll(true);return false;">重置筛选条件</a></p></div>`;
      $('pagination').innerHTML = '';
      return;
    }
    const start = (state.page - 1) * PAGE_SIZE;
    const pageItems = cache.slice(start, start + PAGE_SIZE);
    $('resultsList').innerHTML = pageItems.map((idx, i) => renderBrowseCard(idx, start + i)).join('');
    renderPagination(total);
  }

  /* ---------------- 方向 / 筛选 ---------------- */
  function switchBook(book, silent) {
    if (book !== 'si-zh' && book !== 'zh-si') return;
    if (state.book !== book) state.page = 1;
    state.book = book;
    document.querySelectorAll('.book-tab').forEach((b) => b.classList.toggle('active', b.dataset.book === book));
    $('favBtnSiZh').classList.toggle('active', book === 'si-zh');
    $('favBtnZhSi').classList.toggle('active', book === 'zh-si');
    hideDropdown();
    if (!silent) refreshCurrent();
  }

  function refreshCurrent() {
    state.page = 1;
    const raw = $('searchInput').value.trim();
    if (raw) {
      runSearch(false);
      return;
    }
    state.query = '';
    state.browse = !!(state.prefix || state.statusFilter || state.book === 'zh-si');
    if (state.browse) buildBrowseCache(true);
    else { state.browseCache = null; state.browseKey = ''; }
    updateSearchInfo();
    renderResults();
  }

  function resetAll(showMsg) {
    $('searchInput').value = '';
    state.query = '';
    state.page = 1;
    state.prefix = '';
    state.statusFilter = '';
    state.mode = 'fuzzy';
    state.sim = 60;
    state.groups = [];
    state.hits = 0;
    state.translatedHits = 0;
    state.truncated = 0;
    state.browseCache = null;
    state.browseKey = '';
    $('prefixFilter').value = '';
    $('statusFilter').value = '';
    const fuzzy = document.querySelector('input[name="matchMode"][value="fuzzy"]');
    if (fuzzy) fuzzy.checked = true;
    $('simSlider').value = '60';
    $('simValue').textContent = '60%';
    $('simCtrl').style.display = 'flex';
    document.querySelectorAll('.legend-item').forEach((el) => el.classList.remove('active'));
    hideDropdown();
    state.browse = state.book === 'zh-si';
    if (state.browse) buildBrowseCache(true);
    updateSearchInfo();
    renderResults();
    if (showMsg) showToast('已重置检索条件');
  }

  /* ---------------- 全局交互 ---------------- */
  window.switchBook = switchBook;
  window.resetAll = resetAll;

  window.goPage = function (p) {
    const total = state.browse ? (state.browseCache || []).length : state.groups.length;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    state.page = Math.min(Math.max(1, Number(p) || 1), pages);
    renderResults();
    const el = document.querySelector('.results-section');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  window.toggleExpand = function (gi) {
    const el = $('group-' + gi);
    if (el) el.classList.toggle('expanded');
  };

  window.toggleGroupFav = function (gi, btn) {
    const group = state.groups[gi];
    if (!group) return;
    const allFav = group.items.every((r) => isFav(r.item, state.book));
    if (allFav) {
      const list = getFavs(state.book).filter((f) =>
        !group.items.some((r) => favId(r.item, state.book) === f.id));
      setFavs(state.book, list);
    } else {
      group.items.forEach((r) => {
        if (!isFav(r.item, state.book)) toggleFav(r.item, state.book);
      });
    }
    group.items.forEach((r) => syncFavButtons(r.item));
    const added = !allFav;
    if (btn) {
      btn.classList.toggle('favorited', added);
      btn.innerHTML = added ? ICON_HEART_ON : ICON_HEART;
      btn.title = added ? '取消收藏' : '收藏';
    }
  };

  window.toggleItemFav = function (gi, ii, btn) {
    const group = state.groups[gi];
    if (!group || !group.items[ii]) return;
    const item = group.items[ii].item;
    const added = toggleFav(item, state.book);
    if (btn) {
      btn.classList.toggle('favorited', added);
      btn.innerHTML = added ? ICON_HEART_ON : ICON_HEART;
    }
    syncFavButtons(item);
    if (added) showToast('已加入收藏');
  };

  window.toggleBrowseFav = function (absoluteIndex, btn) {
    const idx = (state.browseCache || [])[absoluteIndex];
    if (idx == null) return;
    const item = DATA[idx];
    const added = toggleFav(item, state.book);
    if (btn) {
      btn.classList.toggle('favorited', added);
      btn.innerHTML = added ? ICON_HEART_ON : ICON_HEART;
    }
    syncFavButtons(item);
    if (added) showToast('已加入收藏');
  };

  window.runQuickSearch = function (word) {
    $('searchInput').value = word;
    runSearch(true);
  };

  window.quickBrowse = function (kind) {
    state.prefix = '';
    $('prefixFilter').value = '';
    state.statusFilter = kind === 'zh' ? 'verified' : (kind === 'mt' ? 'mt' : '');
    $('statusFilter').value = state.statusFilter;
    $('searchInput').value = '';
    state.query = '';
    state.page = 1;
    document.querySelectorAll('.legend-item').forEach((el) => el.classList.remove('active'));
    state.browse = true;
    buildBrowseCache(true);
    updateSearchInfo();
    renderResults();
    const el = document.querySelector('.results-section');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  window.openRandomSample = function () {
    const pool = VERIFIED.length ? VERIFIED : TRANSLATED;
    if (!pool.length) { showToast('暂无可展示的中文词条'); return; }
    const idx = pool[Math.floor(Math.random() * pool.length)];
    if (idx != null) openDetail(DATA[idx]);
  };

  window.openSampleItem = function (idx) {
    if (DATA[idx]) openDetail(DATA[idx]);
  };
  window.openGroupItem = function (gi, ii) {
    const g = state.groups[gi];
    if (g && g.items[ii]) openDetail(g.items[ii].item);
  };
  window.openBrowseItem = function (absoluteIndex) {
    const idx = (state.browseCache || [])[absoluteIndex];
    if (idx != null) openDetail(DATA[idx]);
  };

  /* ---------------- 收藏面板 ---------------- */
  function closeFavPanel() {
    $('favPanel').classList.remove('active');
    $('favOverlay').classList.remove('active');
  }
  window.toggleFavPanel = function (book) {
    const panel = $('favPanel');
    const isOpen = panel.classList.contains('active');
    const target = book || state.panelBook || state.book;
    if (isOpen && (!book || book === state.panelBook)) { closeFavPanel(); return; }
    state.panelBook = target;
    $('favTitle').textContent = target === 'si-zh' ? '僧中收藏本' : '中僧收藏本';
    $('favOverlay').classList.add('active');
    panel.classList.add('active');
    renderFavPanel();
  };

  function renderFavPanel() {
    const book = state.panelBook || state.book;
    const list = getFavs(book);
    const box = $('favPanelContent');
    if (!list.length) {
      box.innerHTML = '<div class="favorites-empty">暂无收藏。点击结果卡片上的收藏按钮即可加入。</div>';
      return;
    }
    box.innerHTML = list.map((f, i) => {
      const head = book === 'si-zh' ? f.si : (f.zh || '（中文释义待补）');
      const sub = book === 'si-zh' ? (f.zh || '中文释义待补') : f.si;
      const time = f.ts ? new Date(f.ts).toLocaleString('zh-CN', { hour12: false }) : '';
      return `<div class="favorites-item">
        <div class="favorites-item-header">
          <div>
            <div class="favorites-item-word">${esc(head)}</div>
            <div class="favorites-item-sinhala">${esc(sub)} · ${esc(f.type || '')}</div>
          </div>
          ${f.status ? `<span class="status-badge">${esc(f.status)}</span>` : ''}
        </div>
        <div class="favorites-item-footer">
          <span class="favorites-item-time">${esc(time)}</span>
          <div class="favorites-item-actions">
            <button class="favorites-item-btn" onclick="viewFav(${i})">查看</button>
            <button class="favorites-item-btn delete" onclick="removeFav(${i})">删除</button>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  window.viewFav = function (i) {
    const book = state.panelBook || state.book;
    const f = getFavs(book)[i];
    if (!f) return;
    closeFavPanel();
    openDetail({ en: f.en, si: f.si, zh: f.zh, type: f.type, note: f.note, status: f.status }, book);
  };
  window.removeFav = function (i) {
    const book = state.panelBook || state.book;
    const list = getFavs(book);
    if (i < 0 || i >= list.length) return;
    list.splice(i, 1);
    setFavs(book, list);
    renderFavPanel();
    showToast('已删除收藏');
  };

  /* ---------------- 详情弹窗 ---------------- */
  function updateDetailFav() {
    const item = state.detailItem;
    if (!item) return;
    const book = state.detailBook || state.book;
    const active = isFav(item, book);
    $('detailFav').innerHTML = active ? (ICON_HEART_ON + ' 已收藏') : (ICON_HEART + ' 收藏');
    $('detailFav').classList.toggle('primary', active);
  }

  function openDetail(item, book) {
    if (!item) return;
    state.detailItem = item;
    state.detailBook = book || state.book;
    state.lastFocus = document.activeElement;
    $('detailSi').textContent = item.si || '—';
    const roman = romanize(item.si || '');
    $('detailRoman').textContent = roman ? '自动转写：' + roman + ' · 仅供参考' : '';
    const srcId = (typeof SRC_MAP !== 'undefined' && SRC_MAP) ? SRC_MAP[normEn(item.en)] : null;
    $('detailMeta').innerHTML = `<span class="type-chip">${esc(item.type || '—')}</span>
      ${statusBadge({ zh: item.zh, status: item.status })}${relMarkHtml(item)}` +
      (srcId ? `<span class="src-chip">来源 ${esc(srcId)}</span>` : '') +
      (/待考/.test(String(item.note || '')) ? '<span class="status-badge pending">该词条僧语待核</span>' : '');
    const zhEl = $('detailZh');
    if (item.zh) {
      zhEl.textContent = item.zh;
      zhEl.classList.remove('pending');
    } else {
      zhEl.textContent = '暂无中文释义（待补）';
      zhEl.classList.add('pending');
    }
    $('detailEn').textContent = item.en || '—';
    /* 释义分层：按全角分号拆分义项 */
    const senses = item.zh
      ? String(item.zh).split('；').map((s) => s.trim()).filter(Boolean)
      : [];
    if (senses.length > 1) {
      $('detailSenses').innerHTML = senses.map((s) => '<li>' + esc(s) + '</li>').join('');
      $('detailSensesBlock').hidden = false;
    } else {
      $('detailSensesBlock').hidden = true;
    }
    /* 多译法与来源 */
    const key = normEn(item.en);
    const alts = ALTS ? ALTS[key] : null;
    if (alts && alts.length) {
      $('detailAlts').innerHTML = alts.map((a) =>
        '<div class="alt-row"><span class="alt-zh">' + esc(a.zh) + '</span>' +
        '<span class="alt-tag">' + esc(a.tag || '') + '</span>' +
        '<span class="alt-src">来源：' + esc(a.source || '待考') + '</span></div>'
      ).join('');
      $('detailAltsBlock').hidden = false;
    } else {
      $('detailAltsBlock').hidden = true;
    }
    /* 例句（中文示例＋可选僧语原句 si；缺 si 时明示待补，不臆造） */
    const exs = EXAMPLES ? EXAMPLES[key] : null;
    if (exs && exs.length) {
      $('detailExamples').innerHTML = exs.map((e) =>
        '<div class="ex-item"><span class="ex-tier">' + esc(e.tier || '示例') + '</span>' +
        '<div class="ex-zh">' + esc(e.zh || '') + '</div>' +
        '<div class="ex-en">' + esc(e.en || '') + '</div>' +
        (e.si
          ? '<div class="ex-si">' + esc(e.si) + '</div>'
          : '<div class="ex-si ex-si-todo">僧语原句待补（底本无对应句，未自撰）</div>') +
        '</div>'
      ).join('');
      $('detailExamplesBlock').hidden = false;
    } else {
      $('detailExamplesBlock').hidden = true;
    }
    /* 语义核对说明 */
    const sem = SEM_NOTES ? SEM_NOTES[key] : '';
    if (sem) {
      $('detailSemantic').textContent = sem;
      $('detailSemanticBlock').hidden = false;
    } else {
      $('detailSemanticBlock').hidden = true;
    }
    /* 状态提示 */
    $('detailHint').textContent = item.status === '机翻待校'
      ? '机器翻译初稿，尚未逐条复核；正式引用前请对照僧语原词与英文释义。'
      : (item.zh ? '已校条目，可结合释义分层、其他译法与例句参考。' : '');
    const noteBlock = $('detailNoteBlock');
    if (item.note) {
      $('detailNote').textContent = item.note;
      noteBlock.hidden = false;
    } else {
      noteBlock.hidden = true;
    }
    updateDetailFav();
    const overlay = $('detailOverlay');
    overlay.hidden = false;
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    setTimeout(() => $('detailClose').focus(), 30);
  }

  function closeDetail() {
    const overlay = $('detailOverlay');
    overlay.classList.remove('active');
    overlay.hidden = true;
    document.body.style.overflow = '';
    state.detailItem = null;
    state.detailBook = null;
    if (state.lastFocus && state.lastFocus !== document.body && typeof state.lastFocus.focus === 'function') {
      try { state.lastFocus.focus(); } catch (e) { /* ignore */ }
    } else {
      try { $('searchInput').focus(); } catch (e) { /* ignore */ }
    }
  }

  function buildCopyText(item) {
    const lines = [];
    lines.push('僧伽罗语：' + (item.si || ''));
    lines.push('中文：' + (item.zh || '待补'));
    lines.push('英文：' + (item.en || ''));
    lines.push('词性/领域：' + (item.type || '') + (TYPE_DESC[item.type] ? '（' + TYPE_DESC[item.type] + '）' : ''));
    if (item.status) lines.push('状态：' + item.status);
    if (item.note) lines.push('备注：' + item.note);
    const key = normEn(item.en);
    if (ALTS && ALTS[key]) {
      lines.push('其他译法：' + ALTS[key].map((a) => a.zh + '（来源：' + (a.source || '待考') + '）').join('；'));
    }
    if (SEM_NOTES && SEM_NOTES[key]) lines.push('语义核对：' + SEM_NOTES[key]);
    return lines.join('\n');
  }

  function copyText(text) {
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      return ok;
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text)
        .then(() => true)
        .catch(() => fallback());
    }
    return Promise.resolve(fallback());
  }

  /* 剪贴板不可用时的降级：选中弹窗内释义，用户按 Ctrl+C 即可复制 */
  function selectDetailText() {
    if (!window.getSelection || !document.createRange) return false;
    const start = $('detailSi');
    const end = $('detailNoteBlock') || $('detailEn') || $('detailSensesBlock') || $('detailZh');
    if (!start || !end) return false;
    try {
      const range = document.createRange();
      range.setStartBefore(start);
      range.setEndAfter(end);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      return true;
    } catch (e) {
      return false;
    }
  }

  function speakSinhala(text) {
    if (!text) return;
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
      showToast('当前浏览器不支持语音朗读');
      return;
    }
    const synth = window.speechSynthesis;
    const voices = synth.getVoices ? synth.getVoices() : [];
    const siVoice = voices.find((v) => /^si([-_]|$)/i.test(v.lang || '') || /sinhala/i.test(v.name || ''));
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'si-LK';
    utter.rate = 0.85;
    if (siVoice) utter.voice = siVoice;
    try {
      synth.cancel();
      synth.speak(utter);
    } catch (e) {
      showToast('朗读失败：' + (e.message || e));
      return;
    }
    if (!siVoice) showToast('未检测到僧伽罗语语音包，正在使用系统默认语音');
  }

  /* ---------------- 僧伽罗语自动转写（参考） ---------------- */
  const INDEPENDENT = {
    'අ': 'a', 'ආ': 'ā', 'ඇ': 'æ', 'ඈ': 'ǣ', 'ඉ': 'i', 'ඊ': 'ī', 'උ': 'u', 'ඌ': 'ū',
    'ඍ': 'ṛ', 'ඎ': 'ṝ', 'ඏ': 'ḷ', 'ඐ': 'ḹ', 'එ': 'e', 'ඒ': 'ē', 'ඓ': 'ai', 'ඔ': 'o',
    'ඕ': 'ō', 'ඖ': 'au'
  };
  const CONSONANTS = {
    'ක': 'k', 'ඛ': 'kh', 'ග': 'g', 'ඝ': 'gh', 'ඞ': 'ṅ', 'ඟ': 'ṅg',
    'ච': 'ch', 'ඡ': 'chh', 'ජ': 'j', 'ඣ': 'jh', 'ඤ': 'ñ', 'ඥ': 'gn', 'ඦ': 'nj',
    'ට': 'ṭ', 'ඨ': 'ṭh', 'ඩ': 'ḍ', 'ඪ': 'ḍh', 'ණ': 'ṇ', 'ඬ': 'ṇḍ',
    'ත': 't', 'ථ': 'th', 'ද': 'd', 'ධ': 'dh', 'න': 'n', 'ඳ': 'nd',
    'ප': 'p', 'ඵ': 'ph', 'බ': 'b', 'භ': 'bh', 'ම': 'm', 'ඹ': 'mb',
    'ය': 'y', 'ර': 'r', 'ල': 'l', 'ව': 'v', 'ශ': 'ś', 'ෂ': 'ṣ', 'ස': 's', 'හ': 'h',
    'ළ': 'ḷ', 'ෆ': 'f'
  };
  const VOWEL_SIGNS = {
    'ා': 'ā', 'ැ': 'æ', 'ෑ': 'ǣ', 'ි': 'i', 'ී': 'ī', 'ු': 'u', 'ූ': 'ū',
    'ෘ': 'ṛ', 'ෲ': 'ṝ', 'ෟ': 'ḷ', 'ෙ': 'e', 'ේ': 'ē', 'ෛ': 'ai', 'ො': 'o',
    'ෝ': 'ō', 'ෞ': 'au'
  };
  const SINHALA_DIGITS = '෦෧෨෩෪෫෬෭෮෯';

  function romanize(text) {
    const src = String(text || '');
    let out = '';
    let consonantPending = false;
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (ch === '\u200d' || ch === '\u200c' || ch === '\u200b') continue;
      if (INDEPENDENT[ch]) {
        if (consonantPending) { out += 'a'; consonantPending = false; }
        out += INDEPENDENT[ch];
        continue;
      }
      if (CONSONANTS[ch]) {
        if (consonantPending) out += 'a';
        out += CONSONANTS[ch];
        consonantPending = true;
        continue;
      }
      if (VOWEL_SIGNS[ch]) {
        out += VOWEL_SIGNS[ch];
        consonantPending = false;
        continue;
      }
      if (ch === '්') {
        consonantPending = false;
        continue;
      }
      if (ch === 'ං') { out += 'ṁ'; consonantPending = false; continue; }
      if (ch === 'ඃ') { out += 'ḥ'; consonantPending = false; continue; }
      if (consonantPending) { out += 'a'; consonantPending = false; }
      const digit = SINHALA_DIGITS.indexOf(ch);
      if (digit >= 0) { out += String(digit); continue; }
      out += ch;
    }
    if (consonantPending) out += 'a';
    return out.replace(/\s+/g, ' ').trim();
  }

  /* ---------------- 提示 ---------------- */
  let cssToastTimer = null;
  function showToast(msg) {
    const t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(cssToastTimer);
    cssToastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  /* ---------------- 初始化 ---------------- */
  function buildTypeFilter() {
    const counts = new Map();
    DATA.forEach((x) => counts.set(x.type, (counts.get(x.type) || 0) + 1));
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    const sel = $('prefixFilter');
    sorted.forEach(([t, n]) => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = `${t}${TYPE_DESC[t] ? ' · ' + TYPE_DESC[t] : ''} (${n.toLocaleString()})`;
      sel.appendChild(opt);
    });
    const legend = $('legendItems');
    sorted.slice(0, 14).forEach(([t]) => {
      const span = document.createElement('span');
      span.className = 'legend-item';
      span.textContent = `${t} ${TYPE_DESC[t] || ''}`;
      span.title = `${TYPE_DESC[t] || t} · ${(counts.get(t) || 0).toLocaleString()} 条`;
      span.dataset.type = t;
      span.onclick = () => {
        state.prefix = t;
        sel.value = t;
        document.querySelectorAll('.legend-item').forEach((el) => el.classList.toggle('active', el.dataset.type === t));
        refreshCurrent();
      };
      legend.appendChild(span);
    });
  }

  function bind() {
    $('searchBtn').addEventListener('click', () => runSearch(true));
    $('searchInput').addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { if (moveSuggest(1)) e.preventDefault(); return; }
      if (e.key === 'ArrowUp') { if (moveSuggest(-1)) e.preventDefault(); return; }
      if (e.key === 'Escape') { hideDropdown(); return; }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (state.suggestActive >= 0 && chooseActiveSuggestion()) return;
        hideDropdown();
        runSearch(true);
      }
    });
    $('searchInput').addEventListener('input', onInput);
    $('searchInput').addEventListener('focus', () => {
      const value = $('searchInput').value.trim();
      if (!value) showHistory();
      else if ($('suggestBox').children.length) showSuggestions();
    });

    document.addEventListener('click', (e) => {
      const box = $('searchHistoryContainer');
      if (box && !box.contains(e.target)) hideDropdown();
    });

    $('historyList').addEventListener('click', (e) => {
      const del = e.target.closest('[data-delete-history]');
      if (del) {
        e.stopPropagation();
        deleteHistory(Number(del.dataset.deleteHistory));
        return;
      }
      const li = e.target.closest('[data-history-index]');
      if (li) applyHistory(Number(li.dataset.historyIndex));
    });
    $('clearHistory').addEventListener('click', (e) => {
      e.stopPropagation();
      try { localStorage.removeItem('sizh_history'); } catch (err) { /* ignore */ }
      renderHistory();
      showToast('搜索历史已清空');
    });

    $('suggestBox').addEventListener('click', (e) => {
      const row = e.target.closest('[data-suggest-index]');
      if (row) chooseSuggestion(Number(row.dataset.suggestIndex));
    });
    $('suggestBox').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const row = e.target.closest('[data-suggest-index]');
      if (row) {
        e.preventDefault();
        chooseSuggestion(Number(row.dataset.suggestIndex));
      }
    });

    document.querySelectorAll('input[name="matchMode"]').forEach((r) => {
      r.addEventListener('change', () => {
        state.mode = document.querySelector('input[name="matchMode"]:checked').value;
        try { localStorage.setItem('sizh_match_mode', state.mode); } catch (err) { /* ignore */ }
        $('simCtrl').style.display = state.mode === 'fuzzy' ? 'flex' : 'none';
        refreshCurrent();
      });
    });
    const slider = $('simSlider');
    slider.addEventListener('input', () => {
      state.sim = Number(slider.value);
      $('simValue').textContent = slider.value + '%';
    });
    slider.addEventListener('change', () => {
      try { localStorage.setItem('sizh_match_sim', String(state.sim)); } catch (err) { /* ignore */ }
      if (state.query && state.mode === 'fuzzy') refreshCurrent();
    });

    $('prefixFilter').addEventListener('change', (e) => {
      state.prefix = e.target.value;
      document.querySelectorAll('.legend-item').forEach((el) => {
        el.classList.toggle('active', !!state.prefix && el.dataset.type === state.prefix);
      });
      refreshCurrent();
    });
    $('statusFilter').addEventListener('change', (e) => {
      state.statusFilter = e.target.value;
      refreshCurrent();
    });
    $('clearBtn').addEventListener('click', () => resetAll(true));

    $('favBtnSiZh').addEventListener('click', (e) => { e.stopPropagation(); toggleFavPanel('si-zh'); });
    $('favBtnZhSi').addEventListener('click', (e) => { e.stopPropagation(); toggleFavPanel('zh-si'); });
    $('favClose').addEventListener('click', closeFavPanel);
    $('favOverlay').addEventListener('click', closeFavPanel);

    document.querySelectorAll('.book-tab').forEach((tab) => {
      tab.addEventListener('click', () => switchBook(tab.dataset.book));
    });

    $('detailClose').addEventListener('click', closeDetail);
    $('detailOverlay').addEventListener('click', (e) => {
      if (e.target === $('detailOverlay')) closeDetail();
    });
    $('detailSpeak').addEventListener('click', () => {
      if (state.detailItem) speakSinhala(state.detailItem.si);
    });
    $('detailFav').addEventListener('click', () => {
      const item = state.detailItem;
      if (!item) return;
      const book = state.detailBook || state.book;
      const added = toggleFav(item, book);
      updateDetailFav();
      if (book === state.book) syncFavButtons(item);
      showToast(added ? '已加入收藏' : '已取消收藏');
    });
    $('detailCopy').addEventListener('click', () => {
      const item = state.detailItem;
      if (!item) return;
      copyText(buildCopyText(item)).then((ok) => {
        if (ok) { showToast('词条已复制到剪贴板'); return; }
        if (selectDetailText()) showToast('已选中释义，按 Ctrl+C 复制');
        else showToast('复制失败，请手动选择文本');
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if ($('detailOverlay').classList.contains('active')) { closeDetail(); return; }
        hideDropdown();
        return;
      }
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '');
      if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        $('searchInput').focus();
        $('searchInput').select();
      }
    });
  }

  /* ---------------- 三语 UI：语种提示 / 僧语键盘 / 复制委托 ---------------- */
  function installTrilingualUI() {
    if (document.getElementById('sitkPanel')) return;
    const st = document.createElement('style');
    st.textContent = [
      '.tri-line{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px;line-height:1.8;min-width:0}',
      '.tri-wrap{min-width:0;flex:1 1 auto}',
      '.tri-cell{font-size:15px;color:#33404d;overflow-wrap:anywhere;word-break:break-word}',
      '.tri-en{font-weight:700;font-size:16px;color:#16202b}',
      '.tri-si{font-family:"Iskoola Pota","Nirmala UI","Noto Sans Sinhala","Noto Serif Sinhala","Malithi Web","Segoe UI",serif;font-size:16px;line-height:1.95}',
      '.tri-zh{color:#2b3a48;font-family:"Microsoft YaHei","PingFang SC","Hiragino Sans GB","SimSun",sans-serif}',
      '.tri-cell.hit{background:#eef4fb;box-shadow:inset 0 -2px 0 #2f6fb3;border-radius:3px;padding:0 2px}',
      '.tri-sep{color:#c2cbd4}',
      '.copy-si{margin-left:2px;padding:1px 7px;font-size:12px;line-height:1.6;color:#2f6fb3;background:#f2f6fb;border:1px solid #d7e2ee;border-radius:4px;cursor:pointer;font-family:inherit}',
      '.copy-si:hover{background:#e6eef8}',
      '.lang-hint{font-size:12px;color:#6b7a89;margin-left:8px;white-space:nowrap}',
      '.sitk-toggle{padding:4px 10px;font-size:13px;color:#2f6fb3;background:#f2f6fb;border:1px solid #d7e2ee;border-radius:6px;cursor:pointer;font-family:inherit}',
      '.sitk-panel{display:none;margin-top:8px;padding:10px;border:1px solid #dde5ee;border-radius:8px;background:#fbfcfe;column-width:auto}',
      '.sitk-panel.open{display:block}',
      '.sitk-row{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px}',
      '.sitk-key{min-width:34px;padding:5px 6px;font-size:16px;line-height:1.3;background:#fff;border:1px solid #d7e2ee;border-radius:5px;cursor:pointer;font-family:"Iskoola Pota","Nirmala UI","Noto Sans Sinhala",serif}',
      '.sitk-key:hover{background:#eef4fb}',
      '.sitk-key.wide{min-width:64px;font-size:13px;font-family:inherit}',
      '.sizh-toast{position:fixed;left:50%;bottom:36px;transform:translateX(-50%);background:rgba(22,32,43,.92);color:#fff;padding:8px 14px;border-radius:6px;font-size:13px;z-index:9999}'
    ].join('');
    document.head.appendChild(st);

    const input = $('searchInput');
    if (input) {
      const hint = document.createElement('span');
      hint.className = 'lang-hint';
      hint.id = 'langHint';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sitk-toggle';
      btn.textContent = '僧语键盘';
      btn.setAttribute('aria-expanded', 'false');
      const host = input.parentNode;
      host.appendChild(hint);
      host.appendChild(btn);

      const panel = document.createElement('div');
      panel.className = 'sitk-panel';
      panel.id = 'sitkPanel';
      const rows = [
        ['අ', 'ආ', 'ඇ', 'ඈ', 'ඉ', 'ඊ', 'උ', 'ඌ', 'එ', 'ඒ', 'ඔ', 'ඕ'],
        ['ක', 'ග', 'ච', 'ජ', 'ට', 'ඩ', 'ත', 'ද', 'න', 'ප', 'බ', 'ම'],
        ['ය', 'ර', 'ල', 'ව', 'ස', 'හ', 'ළ', 'ෆ', 'ං', 'ඃ'],
        ['ා', 'ැ', 'ෑ', 'ි', 'ී', 'ු', 'ූ', 'ෙ', 'ේ', 'ො', 'ෝ', '්']
      ];
      rows.forEach((row) => {
        const d = document.createElement('div');
        d.className = 'sitk-row';
        row.forEach((ch) => {
          const k = document.createElement('button');
          k.type = 'button';
          k.className = 'sitk-key';
          k.textContent = ch;
          k.addEventListener('click', () => insertAtCaret(input, ch));
          d.appendChild(k);
        });
        panel.appendChild(d);
      });
      const tail = document.createElement('div');
      tail.className = 'sitk-row';
      [[' ', '空格'], ['⌫', '退格']].forEach(([ch, label]) => {
        const k = document.createElement('button');
        k.type = 'button';
        k.className = 'sitk-key wide';
        k.textContent = label;
        k.addEventListener('click', () => {
          if (ch === ' ') { insertAtCaret(input, ' '); return; }
          const p = input.selectionStart || input.value.length;
          if (p > 0) {
            input.value = input.value.slice(0, p - 1) + input.value.slice(p);
            input.selectionStart = input.selectionEnd = p - 1;
          }
          input.dispatchEvent(new Event('input'));
        });
        tail.appendChild(k);
      });
      panel.appendChild(tail);
      host.parentNode.insertBefore(panel, host.nextSibling);

      btn.addEventListener('click', () => {
        const open = panel.classList.toggle('open');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });

      const upd = () => {
        const v = input.value.trim();
        const l = v ? detectLang(v) : '';
        hint.textContent = l === 'zh' ? '识别：中文释义' : (l === 'si' ? '识别：僧伽罗语' : (l ? '识别：英文' : ''));
      };
      input.addEventListener('input', upd);
      upd();
    }

    document.addEventListener('click', (e) => {
      const b = e.target.closest ? e.target.closest('[data-copy-si]') : null;
      if (!b) return;
      e.preventDefault();
      const si = b.getAttribute('data-copy-si');
      copyText(si).then((ok) => { toast(ok ? '已复制僧语词头：' + si : '复制失败，请手动选择'); });
    });
  }

  function insertAtCaret(el, text) {
    const s = el.selectionStart == null ? el.value.length : el.selectionStart;
    const e2 = el.selectionEnd == null ? el.value.length : el.selectionEnd;
    el.value = el.value.slice(0, s) + text + el.value.slice(e2);
    const p = s + text.length;
    el.focus();
    try { el.setSelectionRange(p, p); } catch (err) { /* ignore */ }
    el.dispatchEvent(new Event('input'));
  }

  function runSelfTest() {
    const EN = ['buddha', 'water', 'school', 'garden', 'mind', 'path', 'teacher', 'book', 'light', 'village'];
    const SI = ['බුද්ධ', 'ජලය', 'පාසල', 'උයන', 'සිත', 'මග', 'ගුරු', 'පොත', 'එළි', 'ගම'];
    const ZH = ['佛', '水', '学校', '花园', '心', '道路', '老师', '书', '光', '村庄'];
    const out = [];
    let totalHits = 0, totalMs = 0;
    const run = (label, arr) => {
      arr.forEach((q) => {
        const t = performance.now();
        const r = collect(q);
        const ms = performance.now() - t;
        totalHits += r.hits; totalMs += ms;
        out.push({ label, q, lang: r.lang, hits: r.hits, ms: Math.round(ms) });
      });
    };
    run('英文', EN); run('僧语', SI); run('中文', ZH);
    const box = document.createElement('pre');
    box.id = 'selftestOut';
    box.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#fff;color:#111;font:12px/1.5 Consolas,monospace;padding:16px;overflow:auto;white-space:pre-wrap';
    const lines = out.map((o) => `${o.label}\t${o.q}\t${o.lang}\t命中 ${o.hits}\t${o.ms}ms`);
    const summary = `首屏脚本就绪 ${Math.round(window.__initMs || 0)}ms ｜ 30 次检索总命中 ${totalHits} ｜ 平均 ${(totalMs / out.length).toFixed(1)}ms ｜ 最慢 ${Math.max.apply(null, out.map((o) => o.ms))}ms`;
    box.textContent = summary + '\n\n' + lines.join('\n');
    document.body.appendChild(box);
    window.__selftest = { summary, rows: out };
    document.title = 'SELFTEST ' + summary;
  }

  function init() {
    const __t0 = performance.now();
    if (!DATA.length) {
      const boot = $('bootScreen');
      if (boot) boot.remove();
      document.body.innerHTML = '<div class="empty-state" style="padding:4rem 1.5rem"><div class="empty-state-icon">' + ICON_WARN + '</div><p>词典数据加载失败</p><p class="empty-tip">请确认 data/manifest.js 与 data/shard_*.js 存在；如缺失，双击 build_data.cmd 由 data/txt/dictionary.txt 重新生成。</p></div>';
      return;
    }
    const stats = mergeChinese();
    buildIndexes();
    window.__initMs = performance.now() - __t0;
    const typeCount = new Set(DATA.map((x) => x.type)).size;
    $('totalEntries').textContent = DATA.length.toLocaleString();
    $('coveredEntries').textContent = stats.total.toLocaleString();
    $('verifiedEntries').textContent = stats.verified.toLocaleString();
    $('typeCount').textContent = typeCount.toLocaleString();
    const pct = DATA.length ? (stats.total / DATA.length * 100).toFixed(1) : '0.0';
    const mtCount = stats.mt;
    $('coveragePct').textContent = pct + '%';
    $('coverageVerified').textContent = stats.verified.toLocaleString();
    if ($('coverageFirstPass')) $('coverageFirstPass').textContent = stats.firstPass.toLocaleString();
    $('coverageMt').textContent = mtCount.toLocaleString();
    if ($('coveragePending')) $('coveragePending').textContent = stats.pending.toLocaleString();
    $('disclaimerTotal').textContent = DATA.length.toLocaleString();
    $('disclaimerZh').textContent = stats.total.toLocaleString();
    $('disclaimerPct').textContent = pct + '%';
    $('disclaimerVerified').textContent = (stats.verified + stats.firstPass).toLocaleString();
    $('disclaimerMt').textContent = mtCount.toLocaleString();
    $('year').textContent = new Date().getFullYear();

    buildTypeFilter();
    bind();
    installTrilingualUI();
    updateFavCounts();
    const s = $('simSlider');
    state.sim = Number(s.value);
    try {
      const savedMode = localStorage.getItem('sizh_match_mode');
      if (['exact', 'startsWith', 'contains', 'fuzzy'].indexOf(savedMode) >= 0) {
        state.mode = savedMode;
        const radio = document.querySelector('input[name="matchMode"][value="' + savedMode + '"]');
        if (radio) radio.checked = true;
      }
      const savedSim = Number(localStorage.getItem('sizh_match_sim'));
      if (savedSim >= 40 && savedSim <= 95) { state.sim = savedSim; s.value = String(savedSim); }
    } catch (err) { /* ignore */ }
    $('simValue').textContent = state.sim + '%';
    $('simCtrl').style.display = state.mode === 'fuzzy' ? 'flex' : 'none';

    renderWelcome();

    const boot = $('bootScreen');
    if (boot) {
      boot.classList.add('hidden');
      setTimeout(() => boot.remove(), 420);
    }
    if (!('speechSynthesis' in window)) {
      $('detailSpeak').disabled = true;
      $('detailSpeak').textContent = '浏览器不支持朗读';
    }
    if (/[?&]selftest=1/.test(location.search)) setTimeout(runSelfTest, 60);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

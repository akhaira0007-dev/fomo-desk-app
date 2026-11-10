/* STEP 8 iPhone app — plan B: polls public JSON under d/{DATA_PATH}/. Never builds FOMO URLs. */
(function () {
  'use strict';

  const SUPABASE_URL = 'https://acwaicznbxdrdjyqzrlq.supabase.co';
  const DATA_BASE = SUPABASE_URL + '/storage/v1/object/public/desk/d';
  const POLL_MS = 5000;
  const TG_BOT = 'https://t.me/Khaira_desk_bot';
  const LS_KEY = 'desk_data_path';
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const AGENT_ORDER = ['scanner', 'auditor', 'analyst', 'executor', 'risk'];
  const SETTINGS_GROUPS = {
    Scanner: ['scan_min_liq_usd', 'scan_max_top10_pct', 'scan_max_h1_pct', 'scan_poll_s', 'scan_min_pool_age_min', 'scan_drop_after_min', 'runner_h24_pct'],
    Auditor: ['aud_dev_max_pct', 'aud_top10_max_pct', 'aud_lp_min_pct', 'aud_min_pool_age_min', 'aud_bundle_max', 'aud_delegate_max', 'aud_retries'],
    Analyst: ['gate_alive_min', 'gate_organic_min', 'gate_chase_max', 'gate_score_min', 'an_timeout_s', 'rules_vol_h1_usd', 'rules_buys_h1', 'rules_bundle_factor', 'rules_flush_m5_pct', 'rules_chase_h1_pct'],
    Executor: ['size_pct', 'liq_cap_pct', 'min_size_usd', 'recheck_liq_drop_pct', 'recheck_price_up_pct', 'live_tap_timeout_min'],
    Risk: ['risk_poll_s', 'stop_pct', 'trail_on_pct', 'trail_pct', 'timeout_h', 'timeout_min_gain_pct', 'live_sold_repush_min'],
    Desk: ['paper_stack_usd', 'report_time', 'rpc_url'],
  };
  const SETTING_ALIAS = {
    stop_pct: 'stop', trail_pct: 'trail', size_pct: 'stack_pct',
    scan_min_liq_usd: 'min_liquidity', paper_stack_usd: 'stack',
  };

  const state = {
    path: null,
    mock: null, // 'live' | 'empty' | 'loading' | 'error'
    tab: 'home',
    range: 'LIVE',
    data: { state: null, chart: null, activity: null, account: null, settings: null, decisions: {} },
    lastOk: 0,
    failStreak: 0,
    retryIn: 5,
    unread: false,
    viewMint: null,
  };

  const $ = (id) => document.getElementById(id);
  const qs = (sel, el) => (el || document).querySelector(sel);
  const qsa = (sel, el) => [...(el || document).querySelectorAll(sel)];

  function dataPathFromHash() {
    const h = location.hash || '';
    const m = h.match(/[#&]d=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function initPath() {
    const fromHash = dataPathFromHash();
    if (fromHash) {
      localStorage.setItem(LS_KEY, fromHash);
      history.replaceState(null, '', location.pathname + location.search);
      return fromHash;
    }
    return localStorage.getItem(LS_KEY);
  }

  function baseUrl() {
    if (state.mock && state.mock !== 'live') return null;
    return `${DATA_BASE}/${state.path}`;
  }

  async function fetchJson(rel) {
    if (state.mock === 'error') throw new Error('mock offline');
    if (state.mock === 'loading') {
      await new Promise(r => setTimeout(r, 999999)); // hang
    }
    if (state.mock === 'empty') {
      const r = await fetch(`fixtures/${rel}`);
      if (!r.ok) throw new Error('fixture ' + rel);
      return r.json();
    }
    const url = `${baseUrl()}/${rel}?t=${Date.now()}`;
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  }

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._tm);
    toast._tm = setTimeout(() => t.classList.remove('show'), 2200);
  }

  function showCmd(command) {
    $('cmdText').textContent = command;
    $('backdrop').classList.add('open');
    $('cmdSheet').classList.add('open');
  }
  function hideCmd() {
    $('backdrop').classList.remove('open');
    $('cmdSheet').classList.remove('open');
  }

  function fmtMoney(n) {
    if (n == null || isNaN(n)) return '—';
    const abs = Math.abs(n);
    const s = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (n < 0 ? '-$' : '$') + s;
  }
  function fmtPct(n, signed) {
    if (n == null || isNaN(n)) return '—';
    const s = Math.abs(n).toFixed(2) + '%';
    if (!signed) return s;
    return (n >= 0 ? '+' : '-') + s;
  }
  function fmtTime(ts) {
    if (!ts) return '';
    const d = new Date(ts * 1000);
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  function fmtPrice(n) {
    if (n == null || isNaN(n)) return '—';
    if (n >= 1) return '$' + n.toFixed(4);
    if (n >= 0.01) return '$' + n.toFixed(6);
    return '$' + n.toExponential(3);
  }

  /* ---- odometer ---- */
  function setOdometer(el, value) {
    const text = fmtMoney(value);
    if (reduceMotion) { el.textContent = text; return; }
    const next = text.split('');
    const prev = (el.dataset.value || '').split('');
    el.dataset.value = text;
    el.innerHTML = '';
    next.forEach((ch, i) => {
      if (!/\d/.test(ch)) {
        const s = document.createElement('span');
        s.textContent = ch;
        el.appendChild(s);
        return;
      }
      const wrap = document.createElement('span');
      wrap.className = 'digit';
      const strip = document.createElement('span');
      strip.innerHTML = '0<br>1<br>2<br>3<br>4<br>5<br>6<br>7<br>8<br>9';
      const from = (prev[i] && /\d/.test(prev[i])) ? +prev[i] : 0;
      const to = +ch;
      strip.style.transform = `translateY(${-from}em)`;
      wrap.appendChild(strip);
      el.appendChild(wrap);
      const delay = (next.length - 1 - i) * 30;
      requestAnimationFrame(() => {
        setTimeout(() => { strip.style.transform = `translateY(${-to}em)`; }, delay);
      });
    });
  }

  /* ---- tabs / navigation ---- */
  function setTab(name) {
    state.tab = name;
    qsa('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
    qsa('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    $('auditorScreen').classList.remove('open');
    $('coinScreen').classList.remove('open');
  }

  function openCoin(mint) {
    state.viewMint = mint;
    $('coinScreen').classList.add('open');
    loadCoin(mint);
  }
  function openAuditor(mint) {
    state.viewMint = mint;
    $('auditorScreen').classList.add('open');
    loadAudit(mint);
  }

  /* ---- render home ---- */
  function renderHome() {
    const st = state.data.state;
    if (!st) return;
    setOdometer($('balanceOdo'), st.balance);
    const pill = $('paperPill');
    pill.classList.toggle('hidden', !(st.paper_badge || st.mode === 'PAPER'));
    const tp = $('todayPct');
    tp.textContent = fmtPct(st.today_pct, true);
    tp.className = 'today ' + (st.today_pct > 0 ? 'up' : st.today_pct < 0 ? 'down' : '');
    $('multPill').textContent = (st.multiplier != null ? Number(st.multiplier).toFixed(2) : '1.00') + '×';

    const running = (st.agents || []).filter(a => a.status === 'running').length;
    $('agentsHeading').textContent = `Agents · ${running} running`;
    renderCarousel(st.agents || []);
    renderActivityList($('homeActivity'), (state.data.activity && state.data.activity.rows || []).slice(0, 5), true);
    drawHomeChart();
  }

  function renderCarousel(agents) {
    const root = $('agentCarousel');
    const by = Object.fromEntries((agents || []).map(a => [a.name, a]));
    const w = Math.max(280, window.innerWidth - 32);
    const radius = 42 * w / 504;
    root.innerHTML = AGENT_ORDER.map(name => {
      const a = by[name] || { name, label: name, info: '', status: 'stopped', color: '#fff' };
      return `<article class="agent-card" data-agent="${name}" style="border-radius:${radius}px;flex-basis:${w}px">
        <div class="ac-top"><div class="ac-name" style="color:${a.color || '#fff'}">${a.label || name}</div>
        <div class="ac-count">${escapeHtml(a.info || a.status || '')}</div></div>
        <div class="ac-body" id="card-${name}"></div></article>`;
    }).join('');
    // fill bodies from decisions / info
    fillScannerCard(by.scanner);
    fillAuditorCard(by.auditor);
    fillAnalystCard(by.analyst);
    fillExecutorCard(by.executor);
    fillRiskCard(by.risk);
  }

  function fillScannerCard(a) {
    const el = $('card-scanner'); if (!el) return;
    const dec = (state.data.decisions.scanner || {}).decisions || [];
    if (!dec.length) {
      el.innerHTML = '<div style="color:var(--tertiary)">Listening for graduations</div>';
      return;
    }
    el.innerHTML = dec.slice(0, 6).map(d => {
      const killed = d.verdict === 'kill' || d.verdict === 'reject';
      return `<div class="feed-row"><span class="${killed ? 'killed' : ''}">${escapeHtml(d.coin || d.mint.slice(0,6))}</span>
        <span class="${killed ? 'reason' : 'pass'}">${killed ? escapeHtml(d.reason || '') : '→ auditor'}</span></div>`;
    }).join('');
  }
  function fillAuditorCard(a) {
    const el = $('card-auditor'); if (!el) return;
    const info = (a && a.info) || '';
    el.innerHTML = `<div class="layer-grid">${Array.from({length:8},(_,i)=>`<div class="layer-strip" id="as${i}"></div>`).join('')}</div>
      <div style="margin-top:10px">${escapeHtml(info || 'Idle')}</div>`;
  }
  function fillAnalystCard(a) {
    const el = $('card-analyst'); if (!el) return;
    const dec = (state.data.decisions.analyst || {}).decisions || [];
    const score = dec[0] && dec[0].score;
    el.innerHTML = `<div class="score-ring-wrap"><canvas id="scoreRing" width="72" height="72"></canvas>
      <div><div style="color:#ffd60a;font-weight:600">Scoring</div>
      <div style="margin-top:4px">${escapeHtml((a && a.info) || '—')}</div></div></div>`;
    requestAnimationFrame(() => DeskCharts.drawScoreRing($('scoreRing'), score));
  }
  function fillExecutorCard(a) {
    const el = $('card-executor'); if (!el) return;
    el.innerHTML = `<div>${escapeHtml((a && a.info) || '0 trades')}</div>
      <div class="exec-bar"><i style="width:0%"></i></div>`;
  }
  function fillRiskCard(a) {
    const el = $('card-risk'); if (!el) return;
    const s = (state.data.settings && state.data.settings.settings) || {};
    el.innerHTML = `<div>${escapeHtml((a && a.info) || 'Guarding')}</div>
      <div class="pills"><span class="pill red">stop -${s.stop_pct != null ? s.stop_pct : 6}%</span>
      <span class="pill green">trail ${s.trail_pct != null ? s.trail_pct : 12}%</span></div>`;
  }

  function drawHomeChart() {
    const ch = state.data.chart;
    const canvas = $('homeChart');
    const empty = $('chartEmpty');
    const points = (ch && ch.points) || [];
    const marks = (ch && ch.marks) || [];
    const hasTrade = marks.some(m => m.kind === 'bought' || m.kind === 'sold' || m.kind === 'stopped');
    empty.classList.toggle('hidden', points.length > 1 || hasTrade);
    DeskCharts.drawLineChart(canvas, points, marks, ch && ch.start_value);
  }

  function renderActivityList(root, rows, compact) {
    if (!rows || !rows.length) {
      root.innerHTML = `<div class="empty">${compact ? 'Nothing yet tonight' : 'Nothing yet tonight'}</div>`;
      return;
    }
    root.innerHTML = rows.map(r => {
      const cls = r.kind === 'sold' || (r.value || '').startsWith('+') ? 'pos'
        : (r.kind === 'stopped' || (r.value || '').startsWith('-') ? 'neg' : '');
      return `<button class="row" data-kind="${r.kind}" data-mint="${escapeAttr(r.mint || '')}">
        <div class="t">${escapeHtml(r.title || '')}</div>
        <div class="s">${escapeHtml(r.subtitle || '')}</div>
        <div class="v ${cls}">${escapeHtml(r.value || '')}</div></button>`;
    }).join('');
  }

  function renderActivity() {
    const rows = (state.data.activity && state.data.activity.rows) || [];
    $('activityEmpty').classList.toggle('hidden', rows.length > 0);
    renderActivityList($('activityList'), rows, false);
  }

  function renderAgentsTab() {
    const st = state.data.state || { agents: [] };
    const by = Object.fromEntries((st.agents || []).map(a => [a.name, a]));
    const openPos = false; // Risk lock: we don't have open count here; use risk info
    const riskBusy = /Guarding · [1-9]/.test((by.risk && by.risk.info) || '');
    $('agentsList').innerHTML = AGENT_ORDER.map(name => {
      const a = by[name] || { name, label: name, status: 'stopped', info: '' };
      const dec = (state.data.decisions[name] || {}).decisions || [];
      const locked = name === 'risk' && riskBusy;
      const on = a.status === 'running' && !a.paused;
      return `<div class="agent-full" data-agent="${name}">
        <div class="af-head">
          <span class="status-dot ${a.status}"></span>
          <div><div style="font-weight:600">${a.label || name}</div>
          <div style="color:var(--secondary);font-size:13px">${escapeHtml(a.info || '')}</div></div>
          <button class="switch ${on ? 'on' : ''} ${locked ? 'locked' : ''}" data-pause="${name}"
            aria-label="Pause ${name}"></button>
        </div>
        <div class="decisions">${dec.slice(0, 20).map(d => `
          <div class="d-row"><div class="time">${fmtTime(d.ts)}</div>
          <div><a href="${escapeAttr(d.coin_url || '#')}" target="_blank" rel="noopener">${escapeHtml(d.coin || '')}</a>
          · ${escapeHtml(d.verdict || '')} · ${escapeHtml(d.reason || '')}</div></div>`).join('') ||
          '<div class="empty" style="padding:16px">No decisions yet</div>'}
        </div>
        <button class="link" data-settings="${name}" style="margin-top:8px;color:var(--blue)">Settings</button>
      </div>`;
    }).join('');
  }

  function renderAccount() {
    const acc = state.data.account || {};
    const s = (state.data.settings && state.data.settings.settings) || {};
    $('modePaper').classList.toggle('on', acc.mode === 'PAPER');
    $('modeLive').classList.toggle('on', acc.mode === 'LIVE');
    $('stackField').value = acc.stack != null ? acc.stack : '';
    $('profileHandle').textContent = '@' + (acc.fomo_handle || '—');
    if (acc.profile_url) $('profileRow').href = acc.profile_url;
    $('tgStatus').textContent = acc.telegram === 'connected' ? 'Connected' : 'Not connected';
    // settings groups
    const root = $('settingsGroups');
    root.innerHTML = Object.entries(SETTINGS_GROUPS).map(([group, keys]) => {
      const rows = keys.filter(k => k in s).map(k => {
        const v = s[k];
        if (typeof v === 'number') {
          return `<div class="slider-row" data-key="${k}">
            <div class="lab"><span>${k}</span><span class="mono">${v}</span></div>
            <input type="range" disabled min="0" max="${Math.max(v * 2, 100)}" step="any" value="${v}">
          </div>`;
        }
        return `<div class="field-row" data-key="${k}"><span>${k}</span>
          <input type="text" disabled value="${escapeAttr(String(v))}"></div>`;
      }).join('');
      return `<div class="settings-group" id="settings-${group.toLowerCase()}"><h3>${group}</h3>
        <div class="card-block">${rows}</div></div>`;
    }).join('');
  }

  /* ---- coin / audit ---- */
  async function loadCoin(mint) {
    try {
      const coin = state.mock === 'empty'
        ? await fetchJson('coin_empty.json')
        : await fetchJson(`coin/${mint}.json`);
      $('coinName').textContent = coin.name || mint.slice(0, 8);
      $('coinMeta').textContent = `${coin.symbol || '—'} · ${coin.chain || 'Solana'} · ${coin.age_label || ''}`;
      $('coinShield').textContent = coin.shield || 'n/a';
      $('coinPrice').textContent = fmtPrice(coin.price);
      const pct = coin.pct_since_entry;
      const pe = $('coinPct');
      if (pct == null) { pe.textContent = ''; }
      else {
        pe.textContent = (pct >= 0 ? '▲ ' : '▼ ') + fmtPct(pct, true) + ' since entry';
        pe.className = 'pct-entry ' + (pct >= 0 ? 'up' : 'down');
      }
      $('coinPaper').classList.toggle('hidden', !((state.data.state || {}).paper_badge));
      DeskCharts.drawCandles($('coinChart'), coin.candles || [], coin.exit && coin.exit.trail_line);
      const st = coin.stats || {};
      $('coinStats').innerHTML = [
        ['Market cap', st.market_cap != null ? fmtMoney(st.market_cap) : '—'],
        ['Liquidity', st.liquidity != null ? fmtMoney(st.liquidity) : '—'],
        ['24h volume', st.volume_24h != null ? fmtMoney(st.volume_24h) : '—'],
        ['Holders', st.holders != null ? String(st.holders) : 'n/a'],
      ].map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v num">${v}</div></div>`).join('');
      const pos = $('coinPosition');
      if (coin.position && coin.exit) {
        pos.classList.remove('hidden');
        pos.innerHTML = `<div style="font-weight:600;margin-bottom:6px">Your position · ${fmtMoney(coin.position.size_usd)} in · Executor</div>
          <div class="line"><span class="k">Stop line</span><span>${fmtPrice(coin.exit.stop_line)}</span></div>
          <div class="line"><span class="k">Trail line</span><span>${coin.exit.trail_line != null ? fmtPrice(coin.exit.trail_line) : '—'}</span></div>
          <div class="line"><span class="k">Time left</span><span>${Math.round((coin.exit.timeout_left_s || 0) / 60)}m</span></div>`;
        $('coinFomo').textContent = 'Sell on FOMO';
      } else {
        pos.classList.add('hidden');
        pos.innerHTML = '';
        $('coinFomo').textContent = 'Buy on FOMO';
      }
      if (coin.coin_url) {
        $('coinFomo').href = coin.coin_url;
        $('coinFomo').classList.remove('hidden');
      }
    } catch (e) {
      toast('Couldn’t load coin');
    }
  }

  async function loadAudit(mint) {
    try {
      const aud = state.mock === 'empty'
        ? { name: '—', layers: [], summary: 'No coin taken apart yet', detail: null, coin_url: null, verdict: null }
        : await fetchJson(`audit/${mint}.json`);
      const empty = !aud.layers || aud.layers.every(l => l.value === 'not checked') && !aud.verdict && aud.summary === 'No audit yet';
      // still show structure for scanned-but-not-audited
      $('auditorEmpty').classList.add('hidden');
      $('auditorBody').classList.remove('hidden');
      if (state.mock === 'empty') {
        $('auditorEmpty').classList.remove('hidden');
        $('auditorBody').classList.add('hidden');
        return;
      }
      $('auditorName').textContent = aud.name || mint.slice(0, 8);
      const discs = $('auditorDiscs');
      discs.querySelectorAll('.disc').forEach(d => d.remove());
      (aud.layers || []).forEach(L => {
        const d = document.createElement('div');
        d.className = 'disc';
        d.dataset.layer = L.layer;
        discs.insertBefore(d, $('auditBeam'));
      });
      $('auditorLayers').innerHTML = (aud.layers || []).map(L =>
        `<div class="lr"><span class="ln">${L.layer}. ${escapeHtml(L.name)}</span>
         <span class="lv">${escapeHtml(L.value || '')}</span></div>`).join('');
      $('auditorSummary').textContent = aud.summary || '';
      $('auditorDetail').textContent = aud.detail || '';
      if (aud.coin_url) { $('auditorFomo').href = aud.coin_url; $('auditorFomo').classList.remove('hidden'); }
      runAuditBeam(aud.layers || []);
    } catch (e) {
      $('auditorEmpty').classList.remove('hidden');
      $('auditorBody').classList.add('hidden');
    }
  }

  function runAuditBeam(layers) {
    const beam = $('auditBeam');
    const discs = qsa('.disc', $('auditorDiscs'));
    if (reduceMotion) {
      layers.forEach((L, i) => {
        if (L.pass === true) discs[i] && discs[i].classList.add('ok');
        if (L.pass === false) discs[i] && discs[i].classList.add('bad');
      });
      beam.style.opacity = 0;
      return;
    }
    beam.style.opacity = 1;
    let i = 0;
    function step() {
      if (i >= layers.length) { beam.style.opacity = 0; return; }
      const L = layers[i];
      const disc = discs[i];
      if (disc) {
        const top = disc.offsetTop;
        beam.style.top = top + 'px';
      }
      // wait for server value — if not checked / null and no verdict yet, still advance for display
      setTimeout(() => {
        if (disc) {
          if (L.pass === true) disc.classList.add('ok');
          else if (L.pass === false) disc.classList.add('bad');
        }
        i++;
        setTimeout(step, 150);
      }, 350);
    }
    step();
  }

  /* ---- polling ---- */
  async function pollOnce() {
    if (!state.path && state.mock !== 'empty' && state.mock !== 'loading' && state.mock !== 'error') return;
    if (state.mock === 'loading') {
      $('homeLoading').classList.remove('hidden');
      $('homeBody').classList.add('hidden');
      return;
    }
    try {
      const tasks = [
        fetchJson('state.json').then(d => state.data.state = d),
        fetchJson(`chart/${state.range}.json`).then(d => state.data.chart = d),
        fetchJson('activity.json').then(d => state.data.activity = d),
        fetchJson('account.json').then(d => state.data.account = d),
        fetchJson('settings.json').then(d => state.data.settings = d),
      ];
      for (const name of AGENT_ORDER) {
        tasks.push(fetchJson(`agents/${name}/decisions.json`).then(d => { state.data.decisions[name] = d; }).catch(() => {}));
      }
      await Promise.all(tasks);
      state.lastOk = Date.now();
      state.failStreak = 0;
      $('errorBanner').classList.add('hidden');
      $('homeLoading').classList.add('hidden');
      $('homeBody').classList.remove('hidden');
      renderHome();
      renderActivity();
      renderAgentsTab();
      renderAccount();
      if (state.viewMint && $('coinScreen').classList.contains('open')) loadCoin(state.viewMint);
      if (state.viewMint && $('auditorScreen').classList.contains('open')) loadAudit(state.viewMint);
    } catch (e) {
      state.failStreak++;
      state.retryIn = Math.min(30, 5 * state.failStreak);
      const last = state.lastOk ? new Date(state.lastOk).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
      const b = $('errorBanner');
      b.textContent = `Desk offline · retrying in ${state.retryIn}s · last update ${last}`;
      b.classList.remove('hidden');
      // keep last good numbers — do not clear
    }
  }

  function startPoll() {
    pollOnce();
    setInterval(() => {
      if (state.failStreak) {
        // countdown display
        const b = $('errorBanner');
        if (!b.classList.contains('hidden') && state.lastOk) {
          // poll on schedule still
        }
      }
      pollOnce();
    }, POLL_MS);
  }

  /* ---- invite ---- */
  async function inviteFriend() {
    const url = (state.data.account || {}).signup_url;
    if (!url) { toast('No invite link yet'); return; }
    if (navigator.share) {
      try { await navigator.share({ title: 'FOMO', url }); return; } catch (e) { /* fall through */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied');
    } catch (e) {
      toast('Copy failed');
    }
  }

  /* ---- events ---- */
  function bind() {
    qsa('.tab').forEach(t => t.addEventListener('click', () => setTab(t.dataset.tab)));
    qsa('[data-tab]').forEach(el => {
      if (el.classList.contains('tab')) return;
      el.addEventListener('click', () => setTab(el.dataset.tab));
    });
    $('btnAvatar').addEventListener('click', () => setTab('account'));
    $('ranges').addEventListener('click', e => {
      const b = e.target.closest('button[data-range]');
      if (!b) return;
      state.range = b.dataset.range;
      qsa('#ranges button').forEach(x => x.classList.toggle('on', x === b));
      fetchJson(`chart/${state.range}.json`).then(d => { state.data.chart = d; drawHomeChart(); }).catch(() => {});
    });
    $('homeActivity').addEventListener('click', onActivityClick);
    $('activityList').addEventListener('click', onActivityClick);
    $('agentsList').addEventListener('click', e => {
      const sw = e.target.closest('[data-pause]');
      if (sw) {
        if (sw.classList.contains('locked')) { toast('Risk is locked while a position is open'); return; }
        const name = sw.dataset.pause;
        const isOn = sw.classList.contains('on');
        showCmd(isOn ? `pause ${cap(name)}` : `resume ${cap(name)}`);
        return;
      }
      const set = e.target.closest('[data-settings]');
      if (set) {
        setTab('account');
        const el = document.getElementById('settings-' + set.dataset.settings);
        if (el) el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
      }
    });
    $('modePaper').addEventListener('click', () => showCmd('paper'));
    $('modeLive').addEventListener('click', () => showCmd('live'));
    $('stackField').addEventListener('click', () => showCmd('stack ' + ($('stackField').value || '1240')));
    $('btnTestPush').addEventListener('click', () => showCmd('status'));
    $('inviteRow').addEventListener('click', inviteFriend);
    $('auditorEnabled').addEventListener('click', () => showCmd('set auditor enabled to false'));
    $('auditorBack').addEventListener('click', () => $('auditorScreen').classList.remove('open'));
    $('coinBack').addEventListener('click', () => $('coinScreen').classList.remove('open'));
    $('cmdClose').addEventListener('click', hideCmd);
    $('backdrop').addEventListener('click', hideCmd);
    $('settingsGroups').addEventListener('click', e => {
      const row = e.target.closest('[data-key]');
      if (!row) return;
      const key = row.dataset.key;
      const alias = SETTING_ALIAS[key] || key;
      const s = (state.data.settings && state.data.settings.settings) || {};
      showCmd(`set ${alias} to ${s[key]}`);
    });
    $('btnSearch').addEventListener('click', () => {
      const q = prompt('Search name, symbol or mint');
      if (!q) return;
      // try match in scanner decisions
      const all = AGENT_ORDER.flatMap(n => ((state.data.decisions[n] || {}).decisions || []));
      const hit = all.find(d =>
        (d.mint && d.mint.toLowerCase() === q.toLowerCase()) ||
        (d.coin && d.coin.toLowerCase().includes(q.toLowerCase()))
      );
      if (hit) openCoin(hit.mint);
      else toast('Not found — try a mint');
    });
    window.addEventListener('resize', () => {
      drawHomeChart();
      if ($('scoreRing')) {
        const dec = (state.data.decisions.analyst || {}).decisions || [];
        DeskCharts.drawScoreRing($('scoreRing'), dec[0] && dec[0].score);
      }
    });
  }

  function onActivityClick(e) {
    const row = e.target.closest('.row');
    if (!row || !row.dataset.mint) return;
    if (row.dataset.kind === 'rejected') openAuditor(row.dataset.mint);
    else openCoin(row.dataset.mint);
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function escapeAttr(s) { return escapeHtml(s).replace(/\n/g, ' '); }

  /* ---- boot ---- */
  function boot() {
    const params = new URLSearchParams(location.search);
    state.mock = params.get('mock'); // empty | loading | error | (absent = live)
    // For screenshots of empty/error without a path
    if (state.mock === 'empty' || state.mock === 'loading' || state.mock === 'error') {
      state.path = 'fixture';
      $('gate').classList.add('hidden');
      $('app').classList.remove('hidden');
      if (state.mock === 'error') {
        state.data.state = { balance: 1000, today_pct: 0, multiplier: 1, mode: 'PAPER', paper_badge: true, agents: AGENT_ORDER.map(n => ({ name: n, label: cap(n), status: 'running', info: '', color: '#fff' })) };
        state.data.chart = { range: 'LIVE', points: [{ ts: Date.now()/1000 - 60, value: 1000 }, { ts: Date.now()/1000, value: 1000 }], marks: [], start_value: 1000 };
        state.data.activity = { rows: [], next_before: null, page_size: 30 };
        state.lastOk = Date.now() - 60000;
        renderHome(); renderActivity(); renderAgentsTab(); renderAccount();
      }
      bind();
      startPoll();
      return;
    }

    state.path = initPath();
    if (!state.path) {
      $('gate').classList.remove('hidden');
      $('app').classList.add('hidden');
      return;
    }
    $('gate').classList.add('hidden');
    $('app').classList.remove('hidden');
    bind();
    startPoll();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  boot();
})();

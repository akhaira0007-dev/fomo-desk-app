/* devicePixelRatio-aware canvas charts: Home line, Coin candles, score ring. */
(function (global) {
  'use strict';

  const GREEN = '#00d35a';
  const BLUE = '#0a84ff';
  const RED = '#ff453a';
  const ORANGE = '#ff9f0a';
  const CARD2 = '#2c2c2e';
  const TERT = 'rgba(235,235,245,0.3)';

  function sizeCanvas(canvas) {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: rect.width, h: rect.height, dpr };
  }

  function drawLineChart(canvas, points, marks, startValue, opts) {
    opts = opts || {};
    const { ctx, w, h } = sizeCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    const pad = { t: 28, r: 8, b: 16, l: 8 };
    const iw = w - pad.l - pad.r;
    const ih = h - pad.t - pad.b;

    // empty / waiting: dashed start line (label in DOM)
    if (!points || points.length === 0) {
      const y = pad.t + ih * 0.55;
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = 'rgba(235,235,245,0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + iw, y);
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }

    const vals = points.map(p => p.value);
    if (startValue != null) vals.push(startValue);
    marks = marks || [];
    let min = Math.min(...vals), max = Math.max(...vals);
    if (min === max) { min -= 1; max += 1; }
    const span = max - min;
    min -= span * 0.08; max += span * 0.18;
    const t0 = points[0].ts, t1 = points[points.length - 1].ts || t0 + 1;
    const dt = Math.max(1, t1 - t0);

    function X(ts) { return pad.l + ((ts - t0) / dt) * iw; }
    function Y(v) { return pad.t + ih - ((v - min) / (max - min)) * ih; }

    // gradient fill
    const last = points[points.length - 1];
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = X(p.ts), y = Y(p.value);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.lineTo(X(last.ts), pad.t + ih);
    ctx.lineTo(X(points[0].ts), pad.t + ih);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, pad.t, 0, pad.t + ih);
    g.addColorStop(0, 'rgba(0,211,90,0.28)');
    g.addColorStop(1, 'rgba(0,211,90,0)');
    ctx.fillStyle = g;
    ctx.fill();

    // line
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = X(p.ts), y = Y(p.value);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = GREEN;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // dashed start value ON TOP so it stays visible even when flat
    if (startValue != null) {
      const y = Y(startValue);
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = 'rgba(235,235,245,0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + iw, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // marks — never overlap: stack upward
    const placed = [];
    const sorted = marks.slice().sort((a, b) => a.ts - b.ts);
    sorted.forEach(m => {
      let x = X(m.ts);
      let y = Y(nearestValue(points, m.ts)) - 10;
      // find free row
      let row = 0;
      for (;;) {
        const yy = y - row * 14;
        const clash = placed.some(p => Math.abs(p.x - x) < 48 && Math.abs(p.y - yy) < 12);
        if (!clash) { y = yy; break; }
        row++;
        if (row > 6) break;
      }
      placed.push({ x, y });
      let color = BLUE;
      if (m.kind === 'sold') color = GREEN;
      if (m.kind === 'stopped') color = RED;
      ctx.fillStyle = color;
      ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.globalAlpha = opts.marksOpaque === false ? 0.0 : 1.0;
      ctx.fillText(String(m.label || '').slice(0, 18), x, Math.max(12, y));
      ctx.globalAlpha = 1;
    });
  }

  function nearestValue(points, ts) {
    let best = points[0], bd = Math.abs(points[0].ts - ts);
    for (const p of points) {
      const d = Math.abs(p.ts - ts);
      if (d < bd) { best = p; bd = d; }
    }
    return best.value;
  }

  function drawCandles(canvas, candles, trailLine) {
    const { ctx, w, h } = sizeCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    if (!candles || !candles.length) {
      ctx.fillStyle = TERT;
      ctx.font = '13px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No candles yet', w / 2, h / 2);
      return;
    }
    const pad = { t: 12, r: 8, b: 36, l: 8 };
    const iw = w - pad.l - pad.r;
    const ihPrice = (h - pad.t - pad.b) * 0.72;
    const ihVol = (h - pad.t - pad.b) * 0.22;
    const gap = (h - pad.t - pad.b) * 0.06;

    let lo = Math.min(...candles.map(c => c.l));
    let hi = Math.max(...candles.map(c => c.h));
    if (trailLine != null) { lo = Math.min(lo, trailLine); hi = Math.max(hi, trailLine); }
    if (lo === hi) { lo *= 0.99; hi *= 1.01; }
    const maxVol = Math.max(1, ...candles.map(c => c.volume || 0));
    const n = candles.length;
    const slot = iw / n;
    const bodyW = Math.max(2, slot * 0.6);

    function Yp(v) { return pad.t + ihPrice - ((v - lo) / (hi - lo)) * ihPrice; }

    // trail line
    if (trailLine != null) {
      const y = Yp(trailLine);
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = ORANGE;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + iw, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = ORANGE;
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'left';
      ctx.fillText('Risk trailing stop', pad.l + 4, y - 4);
    }

    candles.forEach((c, i) => {
      const x = pad.l + i * slot + slot / 2;
      const up = c.c >= c.o;
      const color = up ? GREEN : RED;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, Yp(c.h));
      ctx.lineTo(x, Yp(c.l));
      ctx.stroke();
      const y1 = Yp(Math.max(c.o, c.c));
      const y2 = Yp(Math.min(c.o, c.c));
      const bh = Math.max(1, y2 - y1);
      ctx.fillRect(x - bodyW / 2, y1, bodyW, bh);

      // volume
      const vh = ((c.volume || 0) / maxVol) * ihVol;
      const vy = pad.t + ihPrice + gap + ihVol - vh;
      ctx.globalAlpha = 0.45;
      ctx.fillRect(x - bodyW / 2, vy, bodyW, vh);
      ctx.globalAlpha = 1;
    });
  }

  function drawScoreRing(canvas, score) {
    const { ctx, w, h } = sizeCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    const r = Math.min(w, h) / 2 - 6;
    const scoreN = Number(score);
    const ok = !isNaN(scoreN) && scoreN >= 70;
    ctx.lineWidth = 6;
    ctx.strokeStyle = CARD2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    if (!isNaN(scoreN)) {
      const frac = Math.max(0, Math.min(100, scoreN)) / 100;
      ctx.strokeStyle = ok ? GREEN : '#ffd60a';
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#fff';
    ctx.font = '600 18px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(isNaN(scoreN) ? '—' : String(Math.round(scoreN)), cx, cy);
  }

  global.DeskCharts = { drawLineChart, drawCandles, drawScoreRing, sizeCanvas };
})(window);

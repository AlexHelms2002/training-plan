/* ------------------------------------------------------------------
 * insights.js — the Insights tab.
 *
 * Is any of this working? Four questions:
 *   volume    — are the miles going in?           (weekly mileage vs plan)
 *   fitness   — is easy running getting faster?    (easy pace by week)
 *   gym work  — is the lifting still happening?    (weekly tonnage)
 *   strength  — is any single lift going up?       (per-exercise best set)
 *
 * Charts are hand-drawn SVG — no library, works offline. Running metrics
 * are always blue, gym metrics always orange, so the colour means the
 * same thing on every chart. Each chart has a hover readout and a
 * "Show data" table, so nothing is locked behind colour or pixels.
 * ------------------------------------------------------------------ */

window.MT = window.MT || {};

MT.insights = (function () {
  const U = MT.util;
  let root = null;
  let exercisePick = null;      // which exercise the strength chart shows
  const tablesOpen = {};        // chartId -> bool

  /* ================================================================
   * Data
   * ============================================================== */

  /** Per-week actuals for every week that has already started. */
  function weeks() {
    const now = U.weekNumber(U.today()) || MT.PLAN.weeksTotal;
    const out = [];

    for (let n = 1; n <= Math.min(now, MT.PLAN.weeksTotal); n++) {
      const plan = MT.week.breakdown(n);
      const act = MT.week.actuals(n);

      let easySecs = 0, easyMiles = 0, tonnage = 0, sets = 0, sessions = 0;
      act.runs.forEach(r => {
        const t = U.parseTime(r.time), mi = Number(r.miles);
        if (r.type === 'easy' && t && mi > 0) { easySecs += t; easyMiles += mi; }
      });
      act.gym.forEach(g => {
        sessions++;
        (g.rows || []).forEach(row => {
          const w = Number(row.weight) || 0, reps = Number(row.reps) || 0, s = Number(row.sets) || 0;
          if (w && reps && s) tonnage += w * reps * s * (row.perSide ? 2 : 1);
          if (s) sets += s;
        });
      });

      out.push({
        n,
        label: 'W' + n,
        start: plan.dates[0],
        planned: plan.total,
        actual: act.miles,
        longest: act.runs.reduce((m, r) => Math.max(m, Number(r.miles) || 0), 0),
        easyPace: easyMiles > 0 ? easySecs / easyMiles : null,
        easyMiles: U.round(easyMiles, 1),
        tonnage: Math.round(tonnage),
        sets, sessions
      });
    }
    return out;
  }

  /** Every exercise ever logged → its sessions, best set first. */
  function exercises() {
    const map = {};
    Object.keys(MT.store.all().logs).sort().forEach(date => {
      (MT.store.all().logs[date].gym || []).forEach(sess => {
        (sess.rows || []).forEach(row => {
          const name = String(row.ex || '').trim();
          const w = Number(row.weight) || 0;
          const reps = Number(row.reps) || 0;
          if (!name || !w) return;
          const key = name.toLowerCase();
          map[key] = map[key] || { name, perSide: !!row.perSide, points: [] };
          // Epley: one honest number when the rep scheme moves around.
          const e1rm = reps ? w * (1 + reps / 30) : w;
          const bucket = map[key].points.find(p => p.date === date);
          const point = { date, weight: w, reps, sets: Number(row.sets) || 0, e1rm };
          if (!bucket) map[key].points.push(point);
          else if (e1rm > bucket.e1rm) Object.assign(bucket, point);
        });
      });
    });
    return Object.values(map)
      .filter(e => e.points.length)
      .sort((a, b) => b.points.length - a.points.length);
  }

  /* ================================================================
   * Chart primitives
   * ============================================================== */

  const PAD = { l: 42, r: 14, t: 12, b: 24 };
  const W = 720, H = 210;

  /** Round tick values whose top tick always sits at or above the data. */
  function niceTicks(max, count) {
    if (max <= 0) return [0];
    const mag = Math.pow(10, Math.floor(Math.log10(max / count)));
    const step = [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10, 15, 20]
      .map(m => m * mag)
      .find(s => Math.ceil(max / s) <= count) || mag * 20;
    const ticks = [];
    for (let v = 0; ; v += step) {
      ticks.push(U.round(v, 4));
      if (v >= max - 1e-9) break;
    }
    return ticks;
  }

  /** Shared hover readout for a chart. */
  function tipLayer(wrap) {
    const tip = U.el('div', { class: 'chart-tip' });
    wrap.appendChild(tip);
    return {
      show(x, y, html) {
        tip.innerHTML = html;
        tip.style.left = (x * 100) + '%';
        tip.style.top = (y * 100) + '%';
        tip.classList.add('on');
      },
      hide() { tip.classList.remove('on'); }
    };
  }

  /** A bar whose top corners are rounded and whose base is square. */
  function barPath(x, y, w, h) {
    const r = Math.min(4, w / 2, h);
    return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} ` +
           `L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
  }

  function axes(g, yTicks, yScale, fmt) {
    yTicks.forEach(t => {
      const y = yScale(t);
      g.appendChild(U.svg('line', { class: 'axis-line', x1: PAD.l, x2: W - PAD.r, y1: y, y2: y }));
      g.appendChild(U.svg('text', {
        class: 'axis-text', x: PAD.l - 7, y: y + 3.5, 'text-anchor': 'end',
        text: fmt ? fmt(t) : t
      }));
    });
  }

  /**
   * Columns, optionally with a reference line running over them.
   * points: [{label, value, ref?, tip}]
   */
  function columnChart(opts) {
    const pts = opts.points;
    const wrap = U.el('div', { class: 'chart-wrap' });
    const tip = tipLayer(wrap);
    const svg = U.svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.title });

    const max = Math.max(
      ...pts.map(p => Math.max(p.value || 0, opts.showRef ? (p.ref || 0) : 0)), opts.minMax || 1);
    const ticks = niceTicks(max, 4);
    const top = ticks[ticks.length - 1];
    const yScale = v => PAD.t + (H - PAD.t - PAD.b) * (1 - v / top);

    axes(svg, ticks, yScale, opts.fmtY);

    const band = (W - PAD.l - PAD.r) / pts.length;
    const barW = Math.max(3, Math.min(24, band - 2));   // 2px surface gap, 24px cap

    pts.forEach((p, i) => {
      const x = PAD.l + band * i + (band - barW) / 2;
      const y = yScale(p.value || 0);
      const h = Math.max(p.value > 0 ? 1.5 : 0, yScale(0) - y);
      if (h) {
        svg.appendChild(U.svg('path', {
          d: barPath(x, y, barW, h), fill: opts.color,
          onmouseenter: () => tip.show((x + barW / 2) / W, (y - 8) / H, p.tip),
          onmouseleave: tip.hide
        }));
      }
      // Wider invisible hit target, so hovering a short bar still works.
      svg.appendChild(U.svg('rect', {
        x: PAD.l + band * i, y: PAD.t, width: band, height: H - PAD.t - PAD.b,
        fill: 'transparent',
        onmouseenter: () => tip.show((PAD.l + band * i + band / 2) / W, (Math.min(y, H - PAD.b) - 8) / H, p.tip),
        onmouseleave: tip.hide
      }));
      if (pts.length <= 30 ? (i % Math.ceil(pts.length / 14) === 0) : (i % 4 === 0)) {
        svg.appendChild(U.svg('text', {
          class: 'axis-text', x: PAD.l + band * i + band / 2, y: H - PAD.b + 14,
          'text-anchor': 'middle', text: p.label
        }));
      }
    });

    if (opts.showRef) {
      const d = pts.map((p, i) => {
        const x = PAD.l + band * i + band / 2;
        return `${i ? 'L' : 'M'}${x},${yScale(p.ref || 0)}`;
      }).join(' ');
      svg.appendChild(U.svg('path', {
        d, fill: 'none', stroke: 'var(--chart-ref)', 'stroke-width': 2,
        'stroke-linejoin': 'round', 'stroke-linecap': 'round',
        'pointer-events': 'none'      // decoration: never steal a hover
      }));
    }

    wrap.appendChild(svg);
    return wrap;
  }

  /** A line with dots. points: [{label, value, tip}] — nulls break the line. */
  function lineChart(opts) {
    const pts = opts.points;
    const wrap = U.el('div', { class: 'chart-wrap' });
    const tip = tipLayer(wrap);
    const svg = U.svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.title });

    const values = pts.filter(p => p.value != null).map(p => p.value);
    const rawMin = Math.min(...values), rawMax = Math.max(...values);
    const span = Math.max(rawMax - rawMin, rawMax * 0.08, 1);
    const lo = Math.max(0, rawMin - span * 0.35);
    const hi = rawMax + span * 0.35;
    const yScale = v => PAD.t + (H - PAD.t - PAD.b) * (1 - (v - lo) / (hi - lo));

    const ticks = [lo, lo + (hi - lo) / 2, hi].map(v => U.round(v, 2));
    ticks.forEach(t => {
      const y = yScale(t);
      svg.appendChild(U.svg('line', { class: 'axis-line', x1: PAD.l, x2: W - PAD.r, y1: y, y2: y }));
      svg.appendChild(U.svg('text', {
        class: 'axis-text', x: PAD.l - 7, y: y + 3.5, 'text-anchor': 'end',
        text: opts.fmtY ? opts.fmtY(t) : t
      }));
    });

    const band = (W - PAD.l - PAD.r) / Math.max(1, pts.length);
    const px = i => PAD.l + band * i + band / 2;

    let d = '', pen = false;
    pts.forEach((p, i) => {
      if (p.value == null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${px(i)},${yScale(p.value)} `;
      pen = true;
    });
    svg.appendChild(U.svg('path', {
      d, fill: 'none', stroke: opts.color, 'stroke-width': 2,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round'
    }));

    pts.forEach((p, i) => {
      if (p.value == null) return;
      const cx = px(i), cy = yScale(p.value);
      svg.appendChild(U.svg('circle', {
        cx, cy, r: 4.5, fill: opts.color,
        stroke: 'var(--surface)', 'stroke-width': 2,          // surface ring
        onmouseenter: () => tip.show(cx / W, (cy - 10) / H, p.tip),
        onmouseleave: tip.hide
      }));
      if (i % Math.ceil(pts.length / 12) === 0 || i === pts.length - 1) {
        svg.appendChild(U.svg('text', {
          class: 'axis-text', x: cx, y: H - PAD.b + 14, 'text-anchor': 'middle', text: p.label
        }));
      }
    });

    // Direct label on the last point only — the story is where it ended up.
    const last = pts.reduce((acc, p, i) => (p.value != null ? i : acc), -1);
    if (last >= 0) {
      svg.appendChild(U.svg('text', {
        class: 'axis-text', x: Math.min(px(last) + 9, W - 4), y: yScale(pts[last].value) - 9,
        'text-anchor': 'end', 'font-weight': '700',
        text: opts.fmtY ? opts.fmtY(pts[last].value) : pts[last].value
      }));
    }

    wrap.appendChild(svg);
    return wrap;
  }

  /* ================================================================
   * Cards
   * ============================================================== */

  function card(id, title, note, chart, legend, table) {
    const body = U.el('div', { class: 'card' }, [
      U.el('div', { class: 'chart-head' }, [
        U.el('div', {}, [
          U.el('h3', { style: 'font-size:15px', text: title }),
          note && U.el('p', { class: 'chart-note', text: note })
        ]),
        U.el('div', { class: 'row', style: 'gap:10px' }, [
          legend || null,
          U.el('button', {
            class: 'btn tiny ghost',
            onclick: () => { tablesOpen[id] = !tablesOpen[id]; render(); }
          }, tablesOpen[id] ? 'Hide data' : 'Show data')
        ])
      ]),
      chart
    ]);
    if (tablesOpen[id] && table) body.appendChild(table);
    return body;
  }

  function legendKeys(items) {
    return U.el('div', { class: 'chart-legend' }, items.map(it =>
      U.el('span', { class: 'key' }, [
        U.el('span', { class: 'swatch' + (it.line ? ' line' : ''), style: `background:${it.color}` }),
        it.label
      ])));
  }

  function dataTable(head, rows) {
    return U.el('table', { class: 'data' }, [
      U.el('thead', {}, U.el('tr', {}, head.map(h => U.el('th', { text: h })))),
      U.el('tbody', {}, rows.map(r => U.el('tr', {}, r.map(c => U.el('td', { text: c })))))
    ]);
  }

  const paceFmt = s => (s == null ? '—' : U.fmtTime(s) + '/mi');

  /* ================================================================
   * Render
   * ============================================================== */

  function render(container) {
    root = container || root;
    U.clear(root);

    const wk = weeks();
    const logged = Object.keys(MT.store.all().logs).length;

    if (!logged) {
      root.appendChild(U.el('div', { class: 'card' }, [
        U.el('h2', { text: 'Nothing to show yet' }),
        U.el('p', { class: 'muted', text:
          'Log a few runs and gym sessions and this tab fills in: weekly mileage against the plan, whether your easy pace is drifting down, how much you\'re lifting, and what each individual lift is doing over time.' })
      ]));
      return;
    }

    root.appendChild(tiles(wk));
    root.appendChild(mileageCard(wk));
    root.appendChild(paceCard(wk));
    root.appendChild(tonnageCard(wk));
    root.appendChild(strengthCard());
  }

  /* --- headline numbers ------------------------------------------ */

  function tiles(wk) {
    const totalMiles = U.round(wk.reduce((s, w) => s + w.actual, 0), 1);
    const plannedSoFar = wk.reduce((s, w) => s + w.planned, 0);
    const longest = wk.reduce((m, w) => Math.max(m, w.longest), 0);
    const sessions = wk.reduce((s, w) => s + w.sessions, 0);
    const tonnage = wk.reduce((s, w) => s + w.tonnage, 0);

    // Easy pace: first third of the logged weeks vs the last third.
    const paced = wk.filter(w => w.easyPace);
    let paceDelta = null, firstPace = null, lastPace = null;
    if (paced.length >= 4) {
      const cut = Math.max(1, Math.round(paced.length / 3));
      const avg = arr => arr.reduce((s, w) => s + w.easyPace, 0) / arr.length;
      firstPace = avg(paced.slice(0, cut));
      lastPace = avg(paced.slice(-cut));
      paceDelta = firstPace - lastPace;             // positive = faster now
    }

    const tile = (k, v, n, cls) => U.el('div', { class: 'tile' }, [
      U.el('div', { class: 'k', text: k }),
      U.el('div', { class: 'v' + (cls ? ' ' + cls : ''), text: v }),
      n && U.el('div', { class: 'n', text: n })
    ]);

    return U.el('div', { class: 'card' }, [
      U.el('div', { class: 'tiles' }, [
        tile('Miles logged', String(totalMiles),
          `${Math.round((totalMiles / Math.max(1, plannedSoFar)) * 100)}% of the ${plannedSoFar} mi planned so far`),
        tile('Longest run', longest ? longest + ' mi' : '—', 'this block'),
        tile('Gym sessions', String(sessions),
          tonnage ? Math.round(tonnage / 1000) + 'k lb moved' : 'no weights logged yet'),
        paceDelta == null
          ? tile('Easy pace', paced.length ? paceFmt(paced[paced.length - 1].easyPace) : '—',
            'needs ~4 weeks for a trend')
          : tile('Easy pace', paceFmt(lastPace),
            `${U.fmtTime(Math.abs(paceDelta))}/mi ${paceDelta >= 0 ? 'faster' : 'slower'} than early on (${paceFmt(firstPace)})`,
            paceDelta >= 0 ? 'up' : 'down')
      ])
    ]);
  }

  /* --- charts ----------------------------------------------------- */

  function mileageCard(wk) {
    const points = wk.map(w => ({
      label: w.label, value: w.actual, ref: w.planned,
      tip: `<b>Week ${w.n}</b><br>${w.actual} mi logged<br>${w.planned} mi planned`
    }));
    return card('mileage', 'Weekly mileage',
      'Bars are what you ran; the line is the plan. Being under on a cutback week is the plan working.',
      columnChart({ points, color: 'var(--series-run)', showRef: true, title: 'Weekly mileage against plan', fmtY: v => v }),
      legendKeys([
        { color: 'var(--series-run)', label: 'Logged' },
        { color: 'var(--chart-ref)', label: 'Planned', line: true }
      ]),
      dataTable(['Week', 'Logged', 'Planned', 'Longest run'],
        wk.map(w => ['Week ' + w.n, w.actual + ' mi', w.planned + ' mi', (w.longest || 0) + ' mi'])));
  }

  function paceCard(wk) {
    const points = wk.map(w => ({
      label: w.label, value: w.easyPace,
      tip: `<b>Week ${w.n}</b><br>${paceFmt(w.easyPace)} average<br>${w.easyMiles} easy mi`
    }));
    const any = points.some(p => p.value != null);
    if (!any) {
      return card('pace', 'Easy-run pace',
        'Log a few easy runs with a time and this shows whether the same effort is getting faster.',
        U.el('p', { class: 'empty', text: 'No easy runs with a recorded time yet.' }));
    }
    return card('pace', 'Easy-run pace by week',
      'Average pace of runs you tagged Easy. Lower is faster — a line drifting down at the same effort is fitness arriving.',
      lineChart({ points, color: 'var(--series-run)', title: 'Easy pace by week', fmtY: paceFmt }),
      null,
      dataTable(['Week', 'Easy pace', 'Easy miles'],
        wk.filter(w => w.easyPace).map(w => ['Week ' + w.n, paceFmt(w.easyPace), w.easyMiles + ' mi'])));
  }

  function tonnageCard(wk) {
    const any = wk.some(w => w.tonnage);
    if (!any) {
      return card('tonnage', 'Gym volume',
        'Fill in sets, reps and weight and this tracks how much you\'re actually moving each week.',
        U.el('p', { class: 'empty', text: 'No sets with weight logged yet.' }));
    }
    const points = wk.map(w => ({
      label: w.label, value: w.tonnage,
      tip: `<b>Week ${w.n}</b><br>${w.tonnage.toLocaleString()} lb<br>${w.sets} sets · ${w.sessions} sessions`
    }));
    return card('tonnage', 'Gym volume by week',
      'Sets × reps × weight. It should hold steady through Build I and step down in Build II — running is the priority then.',
      columnChart({ points, color: 'var(--series-gym)', title: 'Weekly gym tonnage',
        fmtY: v => v >= 1000 ? (v / 1000) + 'k' : v }),
      null,
      dataTable(['Week', 'Volume', 'Sets', 'Sessions'],
        wk.filter(w => w.sessions).map(w => ['Week ' + w.n, w.tonnage.toLocaleString() + ' lb', w.sets, w.sessions])));
  }

  function strengthCard() {
    const list = exercises();
    if (!list.length) {
      return card('lift', 'Strength over time',
        'Log an exercise with a weight a few times and its progress shows up here.',
        U.el('p', { class: 'empty', text: 'No exercises with weight logged yet.' }));
    }

    if (!exercisePick || !list.find(e => e.name === exercisePick)) exercisePick = list[0].name;
    const ex = list.find(e => e.name === exercisePick);

    const picker = U.el('select', {
      onchange: e => { exercisePick = e.target.value; render(); }
    }, list.map(e => U.el('option', {
      value: e.name, selected: e.name === exercisePick
    }, `${e.name} (${e.points.length})`)));

    const points = ex.points.map(p => ({
      label: U.fmtDate(p.date),
      value: U.round(p.e1rm, 1),
      tip: `<b>${U.fmtDate(p.date)}</b><br>${p.weight} lb × ${p.reps || '?'}${p.sets ? ' × ' + p.sets + ' sets' : ''}` +
           `${ex.perSide ? ' (per side)' : ''}<br>est. 1RM ${Math.round(p.e1rm)} lb`
    }));

    const first = ex.points[0], last = ex.points[ex.points.length - 1];
    const gain = Math.round(last.e1rm - first.e1rm);
    const note = ex.points.length < 2
      ? 'One session so far — log it again and the trend starts.'
      : `${gain >= 0 ? '+' : ''}${gain} lb estimated 1RM since ${U.fmtDate(first.date)}. ` +
        'Estimated from the heaviest set each session (Epley), so a heavy triple and a light ten are comparable.';

    const chart = ex.points.length < 2
      ? U.el('p', { class: 'empty', text: `${ex.name}: ${last.weight} lb × ${last.reps || '?'} on ${U.fmtDate(last.date)}.` })
      : lineChart({ points, color: 'var(--series-gym)', title: ex.name + ' estimated 1RM',
        fmtY: v => Math.round(v) + ' lb' });

    return card('lift', 'Strength over time', note, chart,
      U.el('div', { class: 'row', style: 'gap:6px' }, [U.el('span', { class: 'muted small', text: 'Exercise' }), picker]),
      dataTable(['Date', 'Weight', 'Reps', 'Sets', 'Est. 1RM'],
        ex.points.map(p => [U.fmtDate(p.date), p.weight + (ex.perSide ? '/side' : ''),
          p.reps || '—', p.sets || '—', Math.round(p.e1rm) + ' lb'])));
  }

  return { render };
})();

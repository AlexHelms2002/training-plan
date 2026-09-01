/* ------------------------------------------------------------------
 * plan.js — the Plan tab.
 *
 * 28 weeks, by week and not by day: each card says how much to run,
 * how long the long run is, what the one hard session is, and which
 * lifts to hit. Which day you do them on is up to you.
 * Everything is editable; edits are saved as overrides.
 * ------------------------------------------------------------------ */

window.MT = window.MT || {};

MT.plan = (function () {
  const U = MT.util;
  let root = null;
  let open = null;          // week number currently expanded
  let rpeOpen = false;      // the RPE scale, expanded or not

  function currentWeek() {
    return U.weekNumber(U.today()) || 1;
  }

  function render(container) {
    root = container || root;
    if (open === null) open = currentWeek();
    U.clear(root);

    root.appendChild(intro());

    const now = currentWeek();
    MT.PLAN.weeks.forEach(w => root.appendChild(weekCard(w.n, now)));
  }

  function intro() {
    const start = U.fmtDate(MT.PLAN.blockStart, { month: 'long', day: 'numeric', year: 'numeric' });
    const race = U.fmtDate(MT.PLAN.raceDate, { month: 'long', day: 'numeric', year: 'numeric' });
    const phases = U.el('div', { class: 'row', style: 'gap:8px;margin-top:10px' },
      Object.values(MT.PLAN.phases).map(p =>
        U.el('span', { class: 'pill phase', style: `background:${p.color}`, text: p.name })));

    return U.el('div', { class: 'card' }, [
      U.el('div', { class: 'row between' }, [
        U.el('div', {}, [
          U.el('h2', { text: 'The block' }),
          U.el('p', { class: 'muted small', style: 'margin:4px 0 0',
            text: `${start} → ${race} · 28 weeks · peak 40 mi/week · three 20-milers` })
        ]),
        U.el('button', { class: 'btn tiny ghost', onclick: () => { open = currentWeek(); render(); scrollToWeek(open); } }, 'Jump to this week')
      ]),
      phases,
      U.el('p', { class: 'muted small', style: 'margin:10px 0 0',
        text: 'Weeks are targets, not prescriptions — click one to edit it. Anything you change here is saved in this browser; the shipped plan lives in js/plan-data.js.' }),
      rpeGuide()
    ]);
  }

  /* --- what RPE means, since every session is prescribed in it ----- */

  const RPE_SCALE = [
    ['10', 'Couldn\'t have done another rep.', 'never here in this block'],
    ['9',  'One rep left.', 'testing a max only'],
    ['8',  'Two reps left.', 'Base main lifts'],
    ['7',  'Three left, bar still moving fast.', 'Build I'],
    ['6',  'Four or more. Comfortably brisk.', 'Build II and Sharpen'],
    ['5',  'Easy. You could do this all day.', 'taper and race week']
  ];

  function rpeGuide() {
    const box = U.el('div', { class: 'rpe-guide' });

    box.appendChild(U.el('div', { class: 'row between' }, [
      U.el('p', { class: 'small', style: 'margin:0;flex:1;min-width:260px', html:
        '<b>RPE</b> — rate of perceived exertion, read as <b>reps in reserve</b>: how many more you could have done. RPE 8 means you stopped two short of failure.' }),
      U.el('button', {
        class: 'btn tiny ghost', style: 'flex:none',
        onclick: () => { rpeOpen = !rpeOpen; render(); }
      }, rpeOpen ? 'hide scale' : 'full scale')
    ]));

    if (rpeOpen) {
      box.appendChild(U.el('table', { class: 'rpe-table' }, U.el('tbody', {},
        RPE_SCALE.map(([n, meaning, where]) => U.el('tr', {}, [
          U.el('td', { class: 'n mono', text: 'RPE ' + n }),
          U.el('td', { text: meaning }),
          U.el('td', { class: 'muted', text: where })
        ])))));
      box.appendChild(U.el('p', { class: 'muted small', style: 'margin:8px 0 0', text:
        'Effort, not arithmetic: on a wrecked-legs week RPE 8 is simply a lighter bar than it was fresh. That self-correction is the point — a fixed percentage of your max would be too much the week after a 20-miler. Across this block the target falls from RPE 8 in Base to RPE 6 by Build II: as the miles climb, lifting deliberately stops being hard.' }));
    }
    return box;
  }

  function scrollToWeek(n) {
    const node = document.getElementById('week-' + n);
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function weekCard(n, now) {
    const b = MT.week.breakdown(n);
    const act = MT.week.actuals(n);
    const dates = b.dates;
    const isCurrent = n === now;
    const isPast = n < now;
    const edited = !!MT.store.all().planOverrides[n];

    const card = U.el('div', {
      class: 'card week-card' + (isCurrent ? ' current' : '') + (isPast ? ' past' : ''),
      id: 'week-' + n
    });

    const pct = b.total ? Math.min(100, (act.miles / b.total) * 100) : 0;

    const head = U.el('div', { class: 'week-head', onclick: () => { open = (open === n ? null : n); render(); } }, [
      U.el('span', { class: 'week-no', text: 'Week ' + n }),
      U.el('span', { class: 'week-dates', text: `${U.fmtDate(dates[0])} – ${U.fmtDate(dates[6])}` }),
      U.el('span', { class: 'pill phase', style: `background:${b.phase.color}`, text: b.phase.name }),
      b.week.cutback && U.el('span', { class: 'pill cutback', text: 'cutback' }),
      edited && U.el('span', { class: 'pill', text: 'edited' }),
      U.el('span', { class: 'week-summary' }, [
        U.el('span', { html: `<b>${b.total}</b> mi` }),
        U.el('span', { class: 'muted', html: `long <b>${b.long}</b>` }),
        U.el('span', { class: 'muted', html: (() => {
          const req = b.gym.filter(g => !g.optional).length;
          const opt = b.gym.length - req;
          return `${req} lift${req === 1 ? '' : 's'}${opt ? ` +${opt} opt` : ''}`;
        })() }),
        (act.miles > 0) && U.el('span', { class: 'bar', title: `${act.miles} of ${b.total} mi logged` },
          U.el('span', { style: `width:${pct}%` })),
        U.el('span', { class: 'muted', text: open === n ? '▾' : '▸' })
      ])
    ]);

    card.appendChild(head);
    if (open === n) card.appendChild(weekBody(n, b));
    return card;
  }

  function weekBody(n, b) {
    const body = U.el('div', { class: 'week-body' });

    // Redraw on the next tick: a field that is still focused when we
    // redraw would otherwise fire change again mid-teardown.
    let pending = null;
    const patch = (key, value) => {
      MT.store.setPlanOverride(n, { [key]: value });
      clearTimeout(pending);
      pending = setTimeout(() => { render(); MT.app.refreshOthers('plan'); }, 0);
    };

    /* --- editable numbers ---------------------------------------- */
    const numbers = U.el('div', { class: 'row', style: 'margin-top:12px;gap:16px' }, [
      U.el('label', { class: 'field' }, [
        U.el('span', { text: 'Weekly miles' }),
        U.el('input', {
          class: 'num', type: 'number', step: '0.5', min: '0', style: 'width:82px',
          value: b.total, onchange: e => patch('miles', Number(e.target.value))
        })
      ]),
      U.el('label', { class: 'field' }, [
        U.el('span', { text: 'Long run' }),
        U.el('input', {
          class: 'num', type: 'number', step: '0.5', min: '0', style: 'width:82px',
          value: b.long, onchange: e => patch('long', Number(e.target.value))
        })
      ]),
      U.el('label', { class: 'field', style: 'flex:1;min-width:240px' }, [
        U.el('span', { text: 'Quality session' }),
        U.el('input', {
          type: 'text', value: b.quality || '',
          onchange: e => patch('quality', e.target.value)
        })
      ])
    ]);
    body.appendChild(numbers);

    /* --- the week at a glance ------------------------------------ */
    const grid = U.el('div', { class: 'week-grid' }, [
      U.el('div', { class: 'week-block' }, [
        U.el('h4', { text: 'Running' }),
        U.el('div', { class: 'small' }, [
          U.el('div', { html: `<b>Long:</b> ${b.long} mi` }),
          !b.raceWeek && U.el('div', { html: `<b>Quality:</b> ~${b.qualityMiles} mi — ${escapeHTML(b.quality || '')}` }),
          b.easyRuns > 0 && U.el('div', { html: `<b>Easy:</b> ${b.easyMiles} mi across ~${b.easyRuns} runs (≈${b.easyPerRun} mi each)` })
        ])
      ]),
      U.el('div', { class: 'week-block' }, [
        U.el('h4', { text: (() => {
          const req = b.gym.filter(g => !g.optional).length;
          const opt = b.gym.length - req;
          return `Gym — ${req} session${req === 1 ? '' : 's'}${opt ? ` + ${opt} optional` : ''}`;
        })() }),
        U.el('div', { class: 'gym-chips' },
          Object.values(MT.PLAN.gym).map(tpl => {
            const on = b.gym.find(g => g.id === tpl.id);
            return U.el('button', {
              class: 'pill' + (on ? (on.optional ? ' cutback' : ' done') : ''),
              style: 'cursor:pointer',
              title: tpl.exercises.map(e => e.name).join(' · '),
              onclick: () => {
                const ids = b.gym.map(g => g.optional ? { id: g.id, opt: true } : g.id);
                const idx = ids.findIndex(g => (g.id || g) === tpl.id);
                if (idx >= 0) ids.splice(idx, 1); else ids.push(tpl.id);
                patch('gym', ids);
              },
              text: (on ? '✓ ' : '+ ') + tpl.name + (on && on.optional ? ' (optional)' : '')
            });
          })),
        U.el('p', { class: 'muted small', style: 'margin:8px 0 0', text: b.phase.liftLoad })
      ])
    ]);
    body.appendChild(grid);

    /* --- what each session actually looks like -------------------- */
    b.gym.forEach(g => body.appendChild(MT.plan.sessionTable(g, n)));

    /* --- focus note + reset -------------------------------------- */
    body.appendChild(U.el('label', { class: 'field', style: 'margin-top:12px' }, [
      U.el('span', { text: 'Focus this week' }),
      U.el('input', { type: 'text', value: b.week.focus || '', onchange: e => patch('focus', e.target.value) })
    ]));

    body.appendChild(U.el('div', { class: 'row between', style: 'margin-top:14px' }, [
      U.el('span', { class: 'muted small', text: `Week ${n} of ${MT.PLAN.weeksTotal} · ${MT.util.daysBetween(U.today(), MT.PLAN.raceDate)} days to race day` }),
      MT.store.all().planOverrides[n] && U.el('button', {
        class: 'btn tiny ghost danger',
        onclick: () => { MT.store.resetPlanWeek(n); render(); MT.app.refreshOthers('plan'); MT.app.toast('Week ' + n + ' reset to the shipped plan'); }
      }, 'Reset this week')
    ]));

    return body;
  }

  /**
   * One planned gym session, priced out: sets × reps from the phase,
   * weight from your own history. Shared with the This Week tab.
   */
  function sessionTable(g, weekNo, opts) {
    const rows = MT.gym.prescribe(g.id, weekNo, (opts || {}).before);
    const tpl = MT.gym.template(g.id);

    return U.el('div', { class: 'session' }, [
      U.el('div', { class: 'session-head' }, [
        U.el('span', { class: 'session-name', text: g.name }),
        g.optional && U.el('span', { class: 'pill cutback', text: 'optional' }),
        tpl && U.el('span', { class: 'muted small', text: tpl.focus })
      ]),
      U.el('table', { class: 'presc' }, U.el('tbody', {}, rows.map(r =>
        U.el('tr', { title: r.why }, [
          U.el('td', { class: 'ex' }, [
            r.name,
            r.tier === 'main' ? U.el('span', { class: 'tag-main', text: 'main' }) : null
          ]),
          U.el('td', { class: 'scheme mono', text: `${r.sets} × ${r.reps}` }),
          U.el('td', { class: 'load mono' + (r.weight == null ? ' muted' : '') },
            r.tier === 'mobility' ? 'bodyweight'
              : r.weight == null ? `RPE ${r.rpe}`
                : `${r.weight} lb${r.side ? '/side' : ''}`)
        ]))))
    ]);
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  return { render, currentWeek, sessionTable };
})();

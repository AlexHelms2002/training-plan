/* ------------------------------------------------------------------
 * suggest.js — the This Week tab.
 *
 * Reads the week's plan, reads what's already in the log, and lays out
 * the days that are left. All of the reasoning lives in week.js; this
 * file just draws it.
 * ------------------------------------------------------------------ */

window.MT = window.MT || {};

MT.suggest = (function () {
  const U = MT.util;
  let root = null;
  let viewWeek = null;
  const expanded = {};          // date -> showing that day's lift sheet

  function render(container) {
    root = container || root;
    const now = U.weekNumber(U.today());
    if (viewWeek === null) viewWeek = now || 1;
    U.clear(root);

    if (!now && viewWeek === (now || 1)) {
      const before = U.today() < MT.PLAN.blockStart;
      root.appendChild(U.el('div', { class: 'card' }, [
        U.el('h2', { text: before ? 'The block hasn\'t started yet' : 'The block is over' }),
        U.el('p', { class: 'muted', text: before
          ? `Week 1 starts ${U.fmtLongDate(MT.PLAN.blockStart)}.`
          : `Race day was ${U.fmtLongDate(MT.PLAN.raceDate)}. Change the dates in js/plan-data.js to start a new block.` })
      ]));
    }

    const s = MT.week.suggest(viewWeek, viewWeek === now ? U.today() : U.weekStart(viewWeek));
    if (!s) return;

    root.appendChild(header(s, now));
    root.appendChild(progress(s));
    root.appendChild(schedule(s, now));
    if (s.act.runs.length || s.act.gym.length) root.appendChild(doneCard(s));
    if (s.notes.length) root.appendChild(notesCard(s));
  }

  /* --- header ----------------------------------------------------- */

  function header(s, now) {
    const b = s.plan;
    const dates = b.dates;
    const daysToRace = U.daysBetween(U.today(), MT.PLAN.raceDate);

    return U.el('div', { class: 'card' }, [
      U.el('div', { class: 'row between' }, [
        U.el('div', {}, [
          U.el('div', { class: 'row', style: 'gap:8px' }, [
            U.el('h2', { text: `Week ${b.n}` }),
            U.el('span', { class: 'pill phase', style: `background:${b.phase.color}`, text: b.phase.name }),
            b.week.cutback && U.el('span', { class: 'pill cutback', text: 'cutback' }),
            b.n !== now && U.el('span', { class: 'pill', text: b.n < now ? 'past week' : 'upcoming' })
          ]),
          U.el('p', { class: 'muted small', style: 'margin:4px 0 0',
            text: `${U.fmtDate(dates[0])} – ${U.fmtDate(dates[6])} · ${daysToRace} days to ${MT.PLAN.raceName.toLowerCase()} day` })
        ]),
        U.el('div', { class: 'row', style: 'gap:6px' }, [
          U.el('button', { class: 'btn tiny ghost', onclick: () => { if (viewWeek > 1) { viewWeek--; render(); } } }, '◀'),
          now && viewWeek !== now && U.el('button', { class: 'btn tiny ghost', onclick: () => { viewWeek = now; render(); } }, 'This week'),
          U.el('button', { class: 'btn tiny ghost', onclick: () => { if (viewWeek < MT.PLAN.weeksTotal) { viewWeek++; render(); } } }, '▶')
        ])
      ]),
      b.week.focus && U.el('p', { class: 'focus-note', text: b.week.focus })
    ]);
  }

  /* --- progress --------------------------------------------------- */

  function progress(s) {
    const b = s.plan, a = s.act;
    const pct = b.total ? Math.min(100, (a.miles / b.total) * 100) : 0;

    const stat = (k, v, extra) => U.el('div', { class: 'prog' }, [
      U.el('div', { class: 'k', text: k }),
      U.el('div', { class: 'v', text: v }),
      extra || null
    ]);

    const required = b.gym.filter(g => !g.optional);
    const gymDone = b.gym.filter(g => a.gymDone[g.id]).length;

    return U.el('div', { class: 'card' }, [
      U.el('div', { class: 'progress-grid' }, [
        stat('Mileage', `${a.miles} / ${b.total} mi`,
          U.el('div', { class: 'bar', style: 'margin-top:6px' }, U.el('span', { style: `width:${pct}%` }))),
        stat('Long run', a.longRun ? `${a.longRun.miles} mi ✓` : `${b.long} mi to go`,
          U.el('span', { class: a.longRun ? 'pill done' : 'pill todo', text: a.longRun ? `logged ${a.longRun.day}` : 'not yet' })),
        stat('Quality', a.qualityRun ? 'done ✓' : (b.raceWeek ? '—' : 'to do'),
          U.el('span', { class: 'muted small', text: a.qualityRun ? (a.qualityRun.name || 'workout logged') : (b.quality || '') })),
        stat('Gym', `${gymDone} / ${required.length}`,
          U.el('div', { class: 'gym-chips', style: 'margin-top:6px' },
            b.gym.map(g => U.el('span', {
              class: 'pill ' + (a.gymDone[g.id] ? 'done' : 'todo'),
              text: (a.gymDone[g.id] ? '✓ ' : '') + g.name.split(' · ')[0] + (g.optional ? '*' : '')
            }))))
      ])
    ]);
  }

  /* --- the schedule ----------------------------------------------- */

  function schedule(s, now) {
    const card = U.el('div', { class: 'card today-card' }, [
      U.el('div', { class: 'row between' }, [
        U.el('h3', { style: 'font-size:15px', text: s.plan.n === now ? 'What\'s left this week' : 'Suggested layout' }),
        U.el('span', { class: 'muted small', text: s.milesLeft > 0 ? `${s.milesLeft} mi still to run` : 'mileage target met' })
      ])
    ]);

    if (s.complete) {
      card.appendChild(U.el('p', { class: 'empty', text: 'This week is in the books.' }));
      return card;
    }

    const today = U.today();
    s.days.forEach(day => {
      const isToday = day.date === today;
      const lines = [];

      if (day.run) {
        lines.push(U.el('div', { class: 'sugg-line' }, [
          U.el('span', { class: 'what', text: day.run.miles ? `${day.run.name} — ${U.round(day.run.miles, 1)} mi` : day.run.name }),
          U.el('span', { class: 'det', text: day.run.detail || '' })
        ]));
      }
      if (day.gym) {
        lines.push(U.el('div', { class: 'sugg-line sugg-gym' }, [
          U.el('span', { class: 'what', text: day.gym.name + (day.gym.optional ? ' (optional)' : '') }),
          U.el('span', { class: 'det', text: day.gym.detail || '' }),
          U.el('button', {
            class: 'btn tiny ghost',
            onclick: () => {
              expanded[day.date] ? delete expanded[day.date] : (expanded[day.date] = true);
              render();
            }
          }, expanded[day.date] ? 'hide lifts' : 'show lifts')
        ]));
        if (expanded[day.date]) {
          // Priced from history up to the day before, so a session you
          // log later today doesn't suggest itself back to you.
          lines.push(MT.plan.sessionTable(day.gym, s.plan.n, { before: U.addDays(day.date, -1) }));
        }
      }
      if (!lines.length) {
        lines.push(U.el('div', { class: 'sugg-line muted', text:
          (day.ranAlready || day.liftedAlready)
            ? 'Done for the day — nothing else scheduled.'
            : 'Open — rest or an easy shakeout.' }));
      }

      // What's already in the book for this day, spelled out.
      const summary = MT.week.daySummary(day.date);
      if (summary.length) {
        lines.push(U.el('div', { class: 'logged-box' }, [
          U.el('div', { class: 'logged-head', text: 'Logged' }),
          ...summary.map(s => U.el('div', { class: 'logged-line', text: s }))
        ]));
      }

      card.appendChild(U.el('div', { class: 'sugg-day' + (isToday ? ' is-today' : '') }, [
        U.el('div', { class: 'when' }, [
          U.el('div', { class: 'dow', text: isToday ? 'Today' : U.dayName(day.date) }),
          U.el('div', { class: 'dt', text: U.fmtDate(day.date) })
        ]),
        U.el('div', { style: 'flex:1' }, lines),
        U.el('div', { class: 'day-actions' }, [
          // Drafts the day's planned work as a normal log entry — every
          // field it fills stays editable.
          (day.run && day.run.kind !== 'rest') || day.gym
            ? U.el('button', {
              class: 'btn tiny' + (isToday ? ' primary' : ''),
              title: 'Create this day\'s entry pre-filled with the plan, then edit the numbers',
              onclick: () => MT.log.createFromPlan(day.date, day)
            }, 'Log planned')
            : null,
          U.el('button', {
            class: 'btn tiny ghost', title: 'Open this day in the log, empty',
            onclick: () => { MT.log.setDate(day.date); MT.app.show('log'); }
          }, 'Blank')
        ])
      ]));
    });

    return card;
  }

  /* --- what's already done ---------------------------------------- */

  function doneCard(s) {
    const card = U.el('div', { class: 'card' }, [
      U.el('h3', { style: 'font-size:15px;margin-bottom:6px', text: 'Done so far this week' })
    ]);
    const list = U.el('div', { class: 'day-list' });

    U.weekDates(s.plan.n).forEach(d => {
      const bits = MT.week.daySummary(d);
      if (!bits.length) return;
      list.appendChild(U.el('div', { class: 'day-row' }, [
        U.el('span', { class: 'd' }, U.el('a', { onclick: () => { MT.log.setDate(d); MT.app.show('log'); } },
          `${U.dayName(d)} ${U.fmtDate(d)}`)),
        U.el('span', { class: 's', text: bits.join(' · ') })
      ]));
    });

    card.appendChild(list);
    return card;
  }

  function notesCard(s) {
    return U.el('div', { class: 'card' }, [
      U.el('h3', { style: 'font-size:15px;margin-bottom:6px', text: 'Worth knowing' }),
      U.el('ul', { class: 'notes-list' }, s.notes.map(n => U.el('li', { text: n })))
    ]);
  }

  function reset() { viewWeek = null; }

  return { render, reset };
})();

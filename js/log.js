/* ------------------------------------------------------------------
 * log.js — the Log tab.
 *
 * One day at a time. Any day can hold any number of runs and any number
 * of gym sessions, so a double day is just two entries.
 *
 *   Gym  → session title + rows of (exercise, sets, reps, weight, per-side?)
 *   Run  → name, mileage, total time, plus per-rep/tempo splits when
 *          the workout had them.
 * ------------------------------------------------------------------ */

window.MT = window.MT || {};

MT.log = (function () {
  const U = MT.util;
  let root = null;
  let date = null;

  const RUN_TYPES = [
    ['easy', 'Easy'], ['long', 'Long'], ['quality', 'Quality / workout'],
    ['race', 'Race'], ['cross', 'Cross-train']
  ];

  function setDate(d) { date = d; if (root) render(); }
  function getDate() { return date || (date = U.today()); }

  function touched() {
    MT.store.save();
    MT.app.updateHeader();
  }

  function structural() {
    MT.store.pruneDay(getDate());
    MT.store.save(true);
    render();
    MT.app.refreshOthers('log');
  }

  /* --- shell ------------------------------------------------------ */

  function render(container) {
    root = container || root;
    const d = getDate();
    U.clear(root);

    root.appendChild(dateBar(d));

    const wk = U.weekNumber(d);
    if (wk) {
      const b = MT.week.breakdown(wk);
      root.appendChild(U.el('p', { class: 'muted small', style: 'margin:-6px 0 16px' , text:
        `Week ${wk} · ${b.phase.name} · target ${b.total} mi, long run ${b.long} mi, ${b.gym.filter(g => !g.optional).length} lifts` }));
    }

    const log = MT.store.logFor(d, true);

    root.appendChild(U.el('div', { class: 'row between section-title' }, [
      U.el('span', { text: 'Running' }),
      U.el('button', { class: 'btn tiny', onclick: addRun }, '+ Add run')
    ]));
    if (!log.runs.length) root.appendChild(U.el('p', { class: 'empty', text: 'No runs logged for this day.' }));
    log.runs.forEach((r, i) => root.appendChild(runEntry(r, i)));

    root.appendChild(U.el('div', { class: 'row between section-title' }, [
      U.el('span', { text: 'Gym' }),
      U.el('button', { class: 'btn tiny', onclick: addGym }, '+ Add gym session')
    ]));
    if (!log.gym.length) root.appendChild(U.el('p', { class: 'empty', text: 'No gym session logged for this day.' }));
    log.gym.forEach((g, i) => root.appendChild(gymEntry(g, i)));

    root.appendChild(U.el('div', { class: 'section-title', text: 'Day notes' }));
    root.appendChild(U.el('textarea', {
      rows: 2, placeholder: 'Sleep, soreness, weather, how it felt…',
      value: log.notes || '',
      oninput: e => { MT.store.logFor(d, true).notes = e.target.value; touched(); },
      onblur: () => { MT.store.pruneDay(d); MT.store.save(true); }
    }));

    root.appendChild(recentDays());
  }

  function dateBar(d) {
    const wk = U.weekNumber(d);
    return U.el('div', { class: 'date-bar' }, [
      U.el('button', { class: 'btn tiny', onclick: () => setDate(U.addDays(d, -1)) }, '◀'),
      U.el('input', { type: 'date', value: d, onchange: e => setDate(e.target.value || U.today()) }),
      U.el('button', { class: 'btn tiny', onclick: () => setDate(U.addDays(d, 1)) }, '▶'),
      U.el('span', { class: 'today-label', text: U.fmtLongDate(d) }),
      d !== U.today() && U.el('button', { class: 'btn tiny ghost', onclick: () => setDate(U.today()) }, 'Today'),
      !wk && U.el('span', { class: 'pill cutback', text: 'outside the training block' })
    ]);
  }

  /* --- prefilling ---------------------------------------------------
   * Two shortcuts, both of which only ever *fill in* fields: everything
   * they write stays editable like anything you typed yourself.
   *   fillFromMemory  — last time you did this exercise
   *   createFromPlan  — today's planned workout, as a draft entry
   * ------------------------------------------------------------------ */

  /** Fill a gym row's empty fields from the last time you did it. */
  function fillFromMemory(row, beforeDate) {
    const last = MT.store.lastExercise(row.ex, beforeDate);
    if (!last) return false;
    if (!row.sets) row.sets = last.sets;
    if (!row.reps) row.reps = last.reps;
    if (row.weight === '' || row.weight == null) row.weight = last.weight;
    if (!row.perSide && last.perSide) row.perSide = true;
    row.memo = `last ${U.fmtDate(last.date)}`;
    return true;
  }

  /**
   * A session's rows, pre-filled from the plan: sets and reps from the
   * phase, weight suggested from your own history. Reps come through as
   * the low end of a range ("8–10" → "8") since the log wants a number.
   */
  function prescribedRows(sessionId, weekNo, date) {
    return MT.gym.prescribe(sessionId, weekNo || U.weekNumber(getDate()) || 1, U.addDays(date || getDate(), -1))
      .map(r => {
        const row = blankSet(r.name);
        row.sets = String(r.sets);
        row.reps = r.tier === 'mobility' ? r.reps : String(MT.gym.repTarget(r.reps) || r.reps);
        row.weight = r.weight == null ? '' : String(r.weight);
        row.perSide = !!r.side;
        row.memo = r.why;
        return row;
      });
  }

  /** "6 × 800m @ 5K pace" → six blank rep rows, distance prefilled. */
  function repsFromText(text) {
    const m = String(text || '').match(
      /(\d+)\s*[×x]\s*([\d.]+)\s*(miles?|mi|km|k|m|minutes?|mins?|min|seconds?|secs?|s)?\b/i);
    if (!m) return [];
    const count = Math.min(20, Number(m[1]) || 0);
    if (count < 2) return [];
    const unit = (m[3] || '').toLowerCase();
    const timeBased = /^(min|mins|minute|minutes|s|sec|secs|second|seconds)$/.test(unit);
    const dist = timeBased ? '' : (m[2] + (unit === 'miles' ? 'mi' : unit));
    return Array.from({ length: count }, (_, i) => ({
      id: U.uid(),
      label: timeBased ? `${m[2]} ${unit}` : 'Rep ' + (i + 1),
      dist, time: '', rest: ''
    }));
  }

  /**
   * Build draft entries for a date from that day's suggestion.
   * Skips whichever half is already logged. Returns what it added.
   */
  function createFromPlan(date, day) {
    const log = MT.store.logFor(date, true);
    const added = [];

    if (day.run && day.run.kind !== 'rest' && !log.runs.length) {
      const kind = day.run.kind;
      const isQuality = kind === 'quality';
      const run = {
        id: U.uid(),
        name: isQuality ? (day.run.detail || 'Quality session') : day.run.name,
        type: kind === 'long' && day.run.name === 'RACE DAY' ? 'race' : kind,
        miles: day.run.miles ? String(U.round(day.run.miles, 1)) : '',
        time: '', notes: '',
        segments: isQuality ? repsFromText(day.run.detail) : []
      };
      log.runs.push(run);
      added.push(`${run.name}${run.miles ? ' (' + run.miles + ' mi)' : ''}`);
    }

    if (day.gym && !log.gym.length) {
      const rows = prescribedRows(day.gym.id, U.weekNumber(date), date);
      log.gym.push({
        id: U.uid(), title: day.gym.name, tag: day.gym.id, notes: '',
        rows: rows.length ? rows : [blankSet()]
      });
      added.push(day.gym.name);
    }

    MT.store.pruneDay(date);
    MT.store.save(true);
    setDate(date);
    MT.app.show('log');
    MT.app.toast(added.length
      ? 'Drafted: ' + added.join(' + ') + ' — edit the numbers as you go'
      : 'That day is already logged');
    return added;
  }

  /* --- runs ------------------------------------------------------- */

  function addRun() {
    MT.store.logFor(getDate(), true).runs.push({
      id: U.uid(), name: '', type: 'easy', miles: '', time: '', notes: '', segments: []
    });
    structural();
  }

  function runEntry(run, idx) {
    const paceEl = U.el('span', { class: 'calc', text: U.pace(run.miles, run.time) });
    const update = (key, value) => {
      run[key] = value;
      paceEl.textContent = U.pace(run.miles, run.time);
      touched();
    };

    const head = U.el('div', { class: 'entry-head' }, [
      U.el('input', {
        type: 'text', style: 'flex:1;min-width:180px', placeholder: 'Workout name — e.g. Tempo Tuesday, Long run',
        value: run.name || '', oninput: e => update('name', e.target.value)
      }),
      U.el('select', { onchange: e => { update('type', e.target.value); MT.app.refreshOthers('log'); } },
        RUN_TYPES.map(([v, label]) => U.el('option', { value: v, selected: run.type === v }, label))),
      U.el('button', {
        class: 'btn tiny ghost danger', title: 'Delete this run',
        onclick: () => { MT.store.logFor(getDate(), true).runs.splice(idx, 1); structural(); }
      }, '✕')
    ]);

    const fields = U.el('div', { class: 'run-grid' }, [
      U.el('label', { class: 'field' }, [
        U.el('span', { text: 'Distance (mi)' }),
        U.el('input', { class: 'num', type: 'number', step: '0.01', min: '0', placeholder: '0',
          value: run.miles, oninput: e => update('miles', e.target.value) })
      ]),
      U.el('label', { class: 'field' }, [
        U.el('span', { text: 'Total time' }),
        U.el('input', { type: 'text', placeholder: '48:20 or 1:32:05',
          value: run.time || '', oninput: e => update('time', e.target.value) })
      ]),
      U.el('label', { class: 'field' }, [
        U.el('span', { text: 'Pace' }),
        U.el('div', { style: 'padding:6px 0' }, paceEl)
      ]),
      U.el('label', { class: 'field', style: 'flex:2;min-width:200px' }, [
        U.el('span', { text: 'Notes' }),
        U.el('input', { type: 'text', placeholder: 'Route, effort, fuel…',
          value: run.notes || '', oninput: e => update('notes', e.target.value) })
      ])
    ]);

    const body = U.el('div', { class: 'entry-body' }, [fields]);

    /* Reps / tempo splits ---------------------------------------- */
    if (run.segments && run.segments.length) {
      body.appendChild(segmentTable(run));
    } else {
      body.appendChild(U.el('div', { style: 'margin-top:10px' },
        U.el('button', {
          class: 'btn tiny ghost',
          onclick: () => { run.segments = [blankSegment(1)]; structural(); }
        }, '+ Add repeats / tempo splits')));
    }

    return U.el('div', { class: 'entry' }, [head, body]);
  }

  function blankSegment(i) {
    return { id: U.uid(), label: 'Rep ' + i, dist: '', time: '', rest: '' };
  }

  function segmentTable(run) {
    const wrap = U.el('div', { class: 'segments' });
    wrap.appendChild(U.el('div', { class: 'row between', style: 'margin-bottom:6px' }, [
      U.el('span', { class: 'muted small', text: 'Reps / tempo splits — distance takes 800m, 1k or 1.5 (miles)' }),
      U.el('span', { class: 'calc', text: segSummary(run) })
    ]));

    const rows = run.segments.map((seg, i) => {
      const pEl = U.el('span', { class: 'calc', text: segPace(seg) });
      const upd = (k, v) => {
        seg[k] = v;
        pEl.textContent = segPace(seg);
        touched();
      };
      return U.el('tr', {}, [
        U.el('td', {}, U.el('input', { type: 'text', value: seg.label || '', placeholder: 'Rep ' + (i + 1),
          oninput: e => upd('label', e.target.value) })),
        U.el('td', {}, U.el('input', { class: 'w-narrow', type: 'text', value: seg.dist || '', placeholder: '800m',
          oninput: e => upd('dist', e.target.value) })),
        U.el('td', {}, U.el('input', { class: 'w-narrow', type: 'text', value: seg.time || '', placeholder: '3:02',
          oninput: e => upd('time', e.target.value) })),
        U.el('td', {}, U.el('input', { class: 'w-narrow', type: 'text', value: seg.rest || '', placeholder: '90s jog',
          oninput: e => upd('rest', e.target.value) })),
        U.el('td', { style: 'width:96px' }, pEl),
        U.el('td', { style: 'width:28px' }, U.el('button', {
          class: 'btn tiny ghost danger',
          onclick: () => { run.segments.splice(i, 1); structural(); }
        }, '✕'))
      ]);
    });

    wrap.appendChild(U.el('table', { class: 'sets' }, [
      U.el('thead', {}, U.el('tr', {}, [
        U.el('th', { text: 'Segment' }), U.el('th', { text: 'Distance' }),
        U.el('th', { text: 'Time' }), U.el('th', { text: 'Recovery' }),
        U.el('th', { text: 'Pace' }), U.el('th', {})
      ])),
      U.el('tbody', {}, rows)
    ]));

    wrap.appendChild(U.el('div', { class: 'row', style: 'margin-top:8px' }, [
      U.el('button', {
        class: 'btn tiny', onclick: () => {
          const last = run.segments[run.segments.length - 1] || {};
          run.segments.push(Object.assign(blankSegment(run.segments.length + 1), { dist: last.dist || '', rest: last.rest || '' }));
          structural();
        }
      }, '+ Rep'),
      U.el('button', {
        class: 'btn tiny ghost danger', onclick: () => { run.segments = []; structural(); }
      }, 'Remove splits')
    ]));

    return wrap;
  }

  function segPace(seg) {
    const mi = U.parseDistance(seg.dist);
    const t = U.parseTime(seg.time);
    return (mi && t) ? U.pace(mi, t) : '';
  }

  function segSummary(run) {
    const good = run.segments.filter(s => U.parseDistance(s.dist) && U.parseTime(s.time));
    if (!good.length) return '';
    const mi = good.reduce((s, x) => s + U.parseDistance(x.dist), 0);
    const t = good.reduce((s, x) => s + U.parseTime(x.time), 0);
    return `${good.length} ${good.length === 1 ? 'rep' : 'reps'} · ${U.round(mi, 2)} mi at work · avg ${U.pace(mi, t)}`;
  }

  /* --- gym -------------------------------------------------------- */

  function addGym() {
    MT.store.logFor(getDate(), true).gym.push({
      id: U.uid(), title: '', tag: '', notes: '',
      rows: [blankSet()]
    });
    structural();
  }

  function blankSet(name) {
    return { id: U.uid(), ex: name || '', sets: '', reps: '', weight: '', perSide: false };
  }

  function gymEntry(sess, idx) {
    const update = (k, v) => { sess[k] = v; touched(); };

    const head = U.el('div', { class: 'entry-head' }, [
      U.el('input', {
        type: 'text', style: 'flex:1;min-width:170px', placeholder: 'Session title — e.g. Push day, Legs + core',
        value: sess.title || '', oninput: e => update('title', e.target.value)
      }),
      U.el('select', {
        title: 'Tag it so the week view knows which planned session this was',
        onchange: e => {
          sess.tag = e.target.value;
          const tpl = MT.gym.template(sess.tag);
          if (tpl && !sess.title) sess.title = tpl.name;
          MT.store.save(true); render(); MT.app.refreshOthers('log');
        }
      }, [
        U.el('option', { value: '', selected: !sess.tag }, 'Untagged'),
        ...Object.values(MT.PLAN.gym).map(t =>
          U.el('option', { value: t.id, selected: MT.gym.normalizeTag(sess.tag) === t.id }, t.name))
      ]),
      sess.tag && U.el('button', {
        class: 'btn tiny ghost', title: 'Fill the rows with this session\'s exercises',
        onclick: () => {
          const existing = sess.rows.filter(r => r.ex || r.sets || r.reps || r.weight);
          const rows = prescribedRows(sess.tag, U.weekNumber(getDate()), getDate());
          const priced = rows.filter(r => r.weight).length;
          sess.rows = rows.concat(existing);
          structural();
          MT.app.toast(priced
            ? `Loaded the plan's sets and reps — ${priced} weight${priced === 1 ? '' : 's'} suggested from your history`
            : 'Loaded the plan\'s sets and reps — pick weights by feel the first time');
        }
      }, 'Load exercises'),
      U.el('button', {
        class: 'btn tiny ghost danger', title: 'Delete this session',
        onclick: () => { MT.store.logFor(getDate(), true).gym.splice(idx, 1); structural(); }
      }, '✕')
    ]);

    const rows = sess.rows.map((row, i) => {
      const upd = (k, v) => { row[k] = v; touched(); };
      return U.el('tr', {}, [
        U.el('td', {}, U.el('input', {
          type: 'text', placeholder: 'Exercise', value: row.ex || '',
          title: row.memo ? 'Prefilled from ' + row.memo : '',
          oninput: e => upd('ex', e.target.value),
          // On leaving the field, fill blanks from the last time you did it.
          onchange: e => {
            row.ex = e.target.value;
            if (!row.sets && !row.reps && !row.weight && fillFromMemory(row, U.addDays(getDate(), -1))) {
              structural();
              MT.app.toast(`${row.ex}: filled from ${row.memo}`);
            } else {
              touched();
            }
          }
        })),
        U.el('td', {}, U.el('select', {
          class: 'w-tiny', title: 'Sets',
          onchange: e => upd('sets', e.target.value)
        }, [
          U.el('option', { value: '', selected: !row.sets }, '–'),
          ...[1, 2, 3, 4, 5].map(n =>
            U.el('option', { value: String(n), selected: String(row.sets) === String(n) }, String(n)))
        ])),
        U.el('td', {}, U.el('input', {
          class: 'w-narrow num', type: 'text', placeholder: 'reps', value: row.reps || '',
          oninput: e => upd('reps', e.target.value)
        })),
        U.el('td', {}, U.el('input', {
          class: 'w-mid num', type: 'text', placeholder: 'lbs', value: row.weight || '',
          oninput: e => upd('weight', e.target.value)
        })),
        U.el('td', {}, U.el('label', { class: 'per-side' }, [
          U.el('input', {
            type: 'checkbox', checked: !!row.perSide,
            onchange: e => upd('perSide', e.target.checked)
          }),
          'per side'
        ])),
        U.el('td', { style: 'width:70px;white-space:nowrap' }, [
          U.el('button', {
            class: 'btn tiny ghost', title: 'Another set of the same exercise',
            onclick: () => {
              sess.rows.splice(i + 1, 0, Object.assign(blankSet(row.ex), {
                sets: row.sets, reps: row.reps, weight: row.weight, perSide: row.perSide
              }));
              structural();
            }
          }, '↻'),
          U.el('button', {
            class: 'btn tiny ghost danger', title: 'Delete row',
            onclick: () => { sess.rows.splice(i, 1); structural(); }
          }, '✕')
        ])
      ]);
    });

    const body = U.el('div', { class: 'entry-body' }, [
      U.el('table', { class: 'sets' }, [
        U.el('thead', {}, U.el('tr', {}, [
          U.el('th', { text: 'Exercise' }), U.el('th', { text: 'Sets' }),
          U.el('th', { text: 'Reps' }), U.el('th', { text: 'Weight' }),
          U.el('th', { text: '' }), U.el('th', {})
        ])),
        U.el('tbody', {}, rows)
      ]),
      U.el('div', { class: 'row', style: 'margin-top:8px' }, [
        U.el('button', { class: 'btn tiny', onclick: () => { sess.rows.push(blankSet()); structural(); } }, '+ Exercise'),
        U.el('input', {
          type: 'text', style: 'flex:1;min-width:160px', placeholder: 'Session notes — energy, PRs, tweaks',
          value: sess.notes || '', oninput: e => update('notes', e.target.value)
        })
      ])
    ]);

    return U.el('div', { class: 'entry' }, [head, body]);
  }

  /* --- recent ----------------------------------------------------- */

  function recentDays() {
    const dates = MT.store.loggedDates().reverse().slice(0, 12);
    const wrap = U.el('div', { class: 'card', style: 'margin-top:24px' }, [
      U.el('h3', { style: 'font-size:14px;margin-bottom:4px', text: 'Recently logged' })
    ]);
    if (!dates.length) {
      wrap.appendChild(U.el('p', { class: 'empty', text: 'Nothing logged yet. Today is a fine place to start.' }));
      return wrap;
    }
    const list = U.el('div', { class: 'day-list' });
    dates.forEach(d => {
      const bits = MT.week.daySummary(d);
      list.appendChild(U.el('div', { class: 'day-row' }, [
        U.el('span', { class: 'd' }, U.el('a', { onclick: () => setDate(d) }, `${U.dayName(d)} ${U.fmtDate(d)}`)),
        U.el('span', { class: 's', text: bits.join(' · ') || 'notes only' })
      ]));
    });
    wrap.appendChild(list);
    return wrap;
  }

  return { render, setDate, getDate, createFromPlan };
})();

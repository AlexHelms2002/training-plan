/* ------------------------------------------------------------------
 * week.js — the brain.
 *
 * Turns "here is the week's plan" + "here is what Alex actually did"
 * into "here is what's left and when to do it". Pure functions, no DOM,
 * so the rules are easy to read and easy to change.
 * ------------------------------------------------------------------ */

window.MT = window.MT || {};

MT.week = (function () {
  const U = () => MT.util;

  /* Normalise a week's gym list into [{id, name, optional}] */
  function gymList(week) {
    return (week.gym || []).map(g => {
      const id = typeof g === 'string' ? g : g.id;
      const tpl = MT.PLAN.gym[id] || { name: id };
      return {
        id, name: tpl.name, focus: tpl.focus,
        lower: !!tpl.lower, optional: !!(g && g.opt)
      };
    });
  }

  /* ---------------------------------------------------------------
   * How the week's mileage splits up.
   * Long run takes its distance; the quality session takes ~34% of
   * what's left; easy running gets the rest across 3 runs.
   * ------------------------------------------------------------- */
  function breakdown(n) {
    const w = MT.store.planWeek(n);
    if (!w) return null;
    const raceWeek = n === MT.PLAN.weeksTotal;
    const long = Number(w.long) || 0;
    const total = Number(w.miles) || 0;
    const rest = Math.max(0, total - long);
    const qualityMiles = raceWeek ? 0 : U().round(rest * 0.34, 1);
    const easyMiles = U().round(rest - qualityMiles, 1);
    const easyRuns = easyMiles > 18 ? 4 : easyMiles > 2 ? 3 : easyMiles > 0 ? 1 : 0;

    return {
      week: w,
      n,
      raceWeek,
      phase: MT.PLAN.phases[w.phase],
      total,
      long,
      quality: w.quality,
      qualityMiles,
      easyMiles,
      easyRuns,
      easyPerRun: easyRuns ? U().round(easyMiles / easyRuns, 1) : 0,
      gym: gymList(w),
      dates: U().weekDates(n)
    };
  }

  /* ---------------------------------------------------------------
   * What actually happened this week.
   * ------------------------------------------------------------- */
  function actuals(n) {
    const plan = breakdown(n);
    const days = MT.store.weekLogs(n);
    const runs = [];
    const gym = [];

    days.forEach(d => {
      if (!d.log) return;
      (d.log.runs || []).forEach(r => runs.push(Object.assign({ date: d.date, day: d.day }, r)));
      (d.log.gym || []).forEach(g => gym.push(Object.assign({ date: d.date, day: d.day }, g)));
    });

    const miles = U().round(runs.reduce((s, r) => s + (Number(r.miles) || 0), 0), 1);
    const seconds = runs.reduce((s, r) => s + (U().parseTime(r.time) || 0), 0);

    const longRun = runs
      .filter(r => r.type === 'long' || (Number(r.miles) || 0) >= plan.long * 0.9)
      .sort((a, b) => (b.miles || 0) - (a.miles || 0))[0] || null;

    const qualityRun = runs.find(r =>
      r.type === 'quality' || r.type === 'race' || (r.segments && r.segments.length)) || null;

    const gymDone = {};
    gym.forEach(g => {
      const tag = MT.gym.normalizeTag(g.tag);
      if (tag) gymDone[tag] = g;
    });

    return {
      plan, runs, gym, miles, seconds,
      longRun, qualityRun, gymDone,
      gymCount: gym.length,
      daysRun: new Set(runs.map(r => r.date)).size
    };
  }

  /* ---------------------------------------------------------------
   * What to do with the days that are left.
   * ------------------------------------------------------------- */
  function suggest(n, refDate) {
    const today = refDate || U().today();
    const plan = breakdown(n);
    const act = actuals(n);
    if (!plan) return null;

    const dates = plan.dates;
    const remaining = dates.filter(d => d >= today);
    const notes = [];

    const milesLeft = Math.max(0, U().round(plan.total - act.miles, 1));
    const needLong = !act.longRun;
    const needQuality = !act.qualityRun && !plan.raceWeek;
    const gymLeft = plan.gym.filter(g => !act.gymDone[g.id]);

    // Nothing left to schedule.
    if (!remaining.length) {
      return {
        plan, act, milesLeft, remaining: [], days: [],
        notes: ['This week is done. Look at next week on the Plan tab.'],
        complete: true
      };
    }

    const logs = MT.store.all().logs;
    const slots = {};                       // date -> { run, gym, ... }
    remaining.forEach(d => {
      const l = logs[d];
      slots[d] = {
        date: d, day: U().dayName(d), run: null, gym: null,
        ranAlready: !!(l && l.runs && l.runs.length),
        liftedAlready: !!(l && l.gym && l.gym.length)
      };
    });

    // Days where a run is already in the book (usually today) don't get
    // another one stacked on top.
    const runnable = remaining.filter(d => !slots[d].ranAlready);

    /* 1 — the long run: Saturday if it's still ahead, otherwise the
           last day left that isn't tomorrow-after-a-hard-day.        */
    let longDate = null;
    if (needLong && plan.long > 0 && runnable.length) {
      if (plan.raceWeek) {
        // Race day is race day. It doesn't move.
        longDate = remaining.includes(MT.PLAN.raceDate) ? MT.PLAN.raceDate : null;
      } else {
        const sat = runnable.find(d => U().dayName(d) === 'Sat');
        const sun = runnable.find(d => U().dayName(d) === 'Sun');
        longDate = sat || sun || runnable[runnable.length - 1];
      }
    }
    if (longDate) {
      slots[longDate].run = {
        kind: 'long',
        name: plan.raceWeek ? 'RACE DAY' : 'Long run',
        miles: plan.long,
        detail: plan.raceWeek ? MT.PLAN.raceName : 'Easy effort, conversational. Fuel every 30–40 min.'
      };
      if (runnable.length === 1) {
        notes.push(`Only one day left and the ${plan.long} mi long run hasn't happened. If it's not realistic, cut it to ${U().round(plan.long * 0.7, 1)} mi rather than skipping it entirely — consistency beats a hero effort.`);
      }
    }

    /* 2 — the quality session: earliest day left that isn't the long
           run and ideally isn't the day before it.                   */
    let qualityDate = null;
    if (needQuality && plan.qualityMiles > 0) {
      const candidates = runnable.filter(d => d !== longDate);
      const spaced = candidates.filter(d => !longDate || U().daysBetween(d, longDate) >= 2);
      qualityDate = spaced[0] || candidates[0] || null;
      if (qualityDate) {
        slots[qualityDate].run = {
          kind: 'quality',
          name: 'Quality session',
          miles: plan.qualityMiles,
          detail: plan.quality
        };
        if (longDate && U().daysBetween(qualityDate, longDate) === 1) {
          notes.push('Quality lands the day before the long run this week — keep the long run easy, or flip the two if your legs disagree.');
        }
      } else {
        notes.push('No room left for the quality session. Skip it rather than cramming it next to the long run.');
      }
    }

    /* 3 — easy miles across whatever days are still open.            */
    const assignedMiles = (longDate ? plan.long : 0) + (qualityDate ? plan.qualityMiles : 0);
    const easyLeft = U().round(Math.max(0, milesLeft - assignedMiles), 1);
    const openDays = runnable.filter(d => !slots[d].run);

    if (easyLeft > 0 && openDays.length) {
      // Aim for easy runs about the size the plan intends rather than
      // sprinkling two-mile jogs over every remaining day.
      const target = Math.max(2.5, plan.easyPerRun || 3);
      const wanted = Math.max(1, Math.min(openDays.length, Math.round(easyLeft / target)));
      const runDays = openDays.slice(0, wanted);
      const per = U().round(easyLeft / runDays.length, 1);

      if (per > 8) {
        notes.push(`Catching up all ${easyLeft} mi would mean ${per} mi a day of easy running. Capped at 8 — finishing the week short is fine, a strained calf is not.`);
      }
      runDays.forEach(d => {
        slots[d].run = {
          kind: 'easy', name: 'Easy run',
          miles: Math.min(per, 8),
          detail: 'Conversational. If you can\'t talk, slow down.'
        };
      });
      openDays.slice(wanted).forEach(d => {
        slots[d].run = { kind: 'rest', name: 'Rest or cross-train', miles: 0, detail: 'Walk, bike, or swim. Legs up.' };
      });

      // Don't put a full easy run the day before a monster long run.
      if (longDate && plan.long >= 16) {
        const eve = runDays.find(d => U().daysBetween(d, longDate) === 1);
        if (eve && slots[eve].run.miles > 4) {
          slots[eve].run.miles = 4;
          slots[eve].run.name = 'Shakeout';
          slots[eve].run.detail = `Short and slow — ${plan.long} mi tomorrow.`;
          notes.push(`Trimmed the day before the long run to a shakeout. The week may finish a couple of miles short; that's the right trade.`);
        }
      }
    } else if (openDays.length) {
      openDays.forEach(d => {
        slots[d].run = { kind: 'rest', name: 'Rest or cross-train', miles: 0, detail: 'Weekly mileage is covered.' };
      });
    }

    /* 4 — gym sessions. Lower body away from the long run, upper body
           anywhere. One session a day, required before optional.     */
    const ordered = gymLeft.slice().sort((a, b) => (a.optional === b.optional) ? 0 : a.optional ? 1 : -1);
    const gymDays = remaining.filter(d => !slots[d].liftedAlready);
    const unplaced = [];

    ordered.forEach(g => {
      const lower = g.lower;
      const pick = gymDays.find(d => {
        if (slots[d].gym) return false;
        if (d === longDate && (lower || plan.long >= 16)) return false;   // never legs on long-run day
        if (lower && longDate && plan.long >= 12 && U().daysBetween(d, longDate) === 1) return false;
        return true;
      }) || gymDays.find(d => !slots[d].gym && d !== longDate);

      if (pick) {
        slots[pick].gym = {
          id: g.id,
          name: g.name,
          optional: g.optional,
          detail: plan.phase.liftLoad,
          week: n                     // so the view can price the session
        };
      } else {
        unplaced.push(g.name.split(' · ')[0]);
      }
    });

    if (unplaced.length === 1) {
      notes.push(`No day left for ${unplaced[0]} — let it go rather than stacking two sessions onto one day.`);
    } else if (unplaced.length > 1) {
      notes.push(`${unplaced.join(', ')} don't fit in the days that are left. Take the ones you can and let the rest go; next week starts fresh.`);
    }

    /* 5 — commentary ------------------------------------------------ */
    const elapsed = dates.filter(d => d < today).length;
    const expected = U().round(plan.total * (elapsed / 7), 1);
    if (elapsed > 0 && !plan.raceWeek) {
      const delta = U().round(act.miles - expected, 1);
      if (delta >= 3) notes.push(`You're ${delta} mi ahead of an even split for the week — the plan's total is the target, not the floor.`);
      else if (delta <= -4) notes.push(`You're ${Math.abs(delta)} mi behind an even split. The schedule below already accounts for it.`);
    }
    if (act.miles > plan.total * 1.2) {
      notes.push(`Already ${act.miles} mi against a ${plan.total} mi week. Extra easy miles are fine; extra hard miles are how blocks fall apart.`);
    }
    if (plan.week.cutback) {
      notes.push('Cutback week — the low volume is the point. Going over doesn\'t bank anything.');
    }
    if (plan.raceWeek) {
      notes.push('Race week. Nothing you do now makes you fitter; plenty can make you slower. Sleep, carbs, easy legs.');
    }

    return {
      plan, act, milesLeft, needLong, needQuality, gymLeft,
      remaining,
      days: remaining.map(d => slots[d]),
      notes,
      complete: false
    };
  }

  /* ---------------------------------------------------------------
   * One day, in words. Used anywhere the app shows "here's what you
   * actually did" — the week view, the log's recent list.
   * ------------------------------------------------------------- */

  const RUN_LABEL = {
    easy: 'Easy run', long: 'Long run', quality: 'Workout',
    race: 'Race', cross: 'Cross-train'
  };

  /** Heaviest working set of a gym session, as "Back squat 3×5 @ 225". */
  function topSet(sess) {
    const rows = (sess.rows || []).filter(r => r.ex && Number(r.weight) > 0);
    if (!rows.length) return null;
    const r = rows.sort((a, b) => Number(b.weight) - Number(a.weight))[0];
    const scheme = [r.sets, r.reps].filter(Boolean).join('×');
    return `${r.ex} ${scheme ? scheme + ' ' : ''}@ ${r.weight}${r.perSide ? '/side' : ''}`;
  }

  function runSummary(r) {
    const parts = [r.name || RUN_LABEL[r.type] || 'Run'];
    if (Number(r.miles)) parts.push(`${U().round(Number(r.miles), 2)} mi`);
    if (r.time) parts.push(`in ${r.time}`);
    const p = U().pace(r.miles, r.time);
    if (p) parts.push(`(${p})`);
    const reps = (r.segments || []).filter(s => U().parseDistance(s.dist) && U().parseTime(s.time));
    if (reps.length) {
      const mi = reps.reduce((s, x) => s + U().parseDistance(x.dist), 0);
      const t = reps.reduce((s, x) => s + U().parseTime(x.time), 0);
      parts.push(`— ${reps.length} reps avg ${U().pace(mi, t)}`);
    }
    return parts.join(' ');
  }

  function gymSummary(g) {
    const rows = (g.rows || []).filter(r => r.ex);
    const sets = rows.reduce((t, r) => t + (Number(r.sets) || 0), 0);
    const bits = [g.title || (MT.gym.template(g.tag) || {}).name || 'Gym session'];
    if (rows.length) {
      bits.push(`${rows.length} exercise${rows.length === 1 ? '' : 's'}${sets ? ', ' + sets + ' sets' : ''}`);
    }
    const top = topSet(g);
    if (top) bits.push('top: ' + top);
    return bits.join(' — ');
  }

  /** Array of one-line summaries for a date; [] when nothing is logged. */
  function daySummary(date) {
    const l = MT.store.all().logs[date];
    if (!l) return [];
    const out = [];
    (l.runs || []).forEach(r => out.push(runSummary(r)));
    (l.gym || []).forEach(g => out.push(gymSummary(g)));
    if (!out.length && (l.notes || '').trim()) out.push('Notes only');
    return out;
  }

  return { breakdown, actuals, suggest, gymList, daySummary, runSummary, gymSummary, topSet };
})();

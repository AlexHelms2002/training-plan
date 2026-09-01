/* ------------------------------------------------------------------
 * gym.js — what to lift, how many, and how much.
 *
 * Sets and reps come from the phase (they get lighter as the miles get
 * heavier). Weight is never invented: it comes from the last time you
 * logged that exercise, moved by one simple rule —
 *
 *   hit the rep target       → add a step (5 lb upper, 10 lb lower)
 *   beat it by 2+ reps       → the rep target dropped this phase, so
 *                              add ~5% instead
 *   fell short               → repeat the same weight until you own it
 *   no history at all        → no number, just the RPE to aim for
 *
 * Every number this file produces is a suggestion that lands in an
 * editable field. Nothing here writes to your log on its own.
 * ------------------------------------------------------------------ */

window.MT = window.MT || {};

MT.gym = (function () {
  const U = MT.util;

  /** Old session ids still map to the new categories. */
  function normalizeTag(tag) {
    if (!tag) return '';
    return MT.PLAN.gym[tag] ? tag : (MT.PLAN.gymAliases[tag] || tag);
  }

  function template(id) {
    return MT.PLAN.gym[normalizeTag(id)] || null;
  }

  /** "8–10" → 8. The number you have to hit before adding weight. */
  function repTarget(reps) {
    const m = String(reps || '').match(/\d+/);
    return m ? Number(m[0]) : null;
  }

  /** Round up to the next plate step — a "go heavier" call must move. */
  function roundUp(value, step) {
    return Math.max(step, Math.ceil(value / step) * step);
  }

  /**
   * Weight suggestion for one exercise.
   * Returns { weight, why } — weight is null when there's no history.
   */
  function suggestWeight(ex, presc, beforeDate) {
    if (ex.tier === 'mobility') return { weight: null, why: 'Bodyweight.' };

    const last = MT.store.lastExercise(ex.name, beforeDate);
    const step = ex.step || 5;
    const target = repTarget(presc.reps);

    if (!last || !Number(last.weight)) {
      return {
        weight: null,
        why: `No history yet — pick a weight you could stop ${presc.rpe === '8' ? 'two' : 'three'} reps short of failure with (RPE ${presc.rpe}), then log it.`
      };
    }

    const lastWeight = Number(last.weight);
    const lastReps = Number(last.reps) || 0;
    const when = U.fmtDate(last.date);

    if (!target || !lastReps) {
      return { weight: lastWeight, why: `Same as ${when}. Log your reps and this starts moving.` };
    }
    if (lastReps >= target + 2) {
      const heavier = Math.max(lastWeight + step, roundUp(lastWeight * 1.05, step));
      return {
        weight: heavier,
        why: `You got ${lastReps} reps at ${lastWeight} on ${when} and the target is down to ${target} — go heavier.`
      };
    }
    if (lastReps >= target) {
      return {
        weight: lastWeight + step,
        why: `+${step} lb: you hit ${lastReps} reps at ${lastWeight} on ${when}.`
      };
    }
    return {
      weight: lastWeight,
      why: `Repeat ${lastWeight} — last time (${when}) you got ${lastReps} of ${target} reps.`
    };
  }

  /**
   * The full prescription for one session in one week.
   * [{ name, tier, sets, reps, rpe, side, weight, why }]
   */
  function prescribe(sessionId, weekNo, beforeDate) {
    const tpl = template(sessionId);
    if (!tpl) return [];
    const week = MT.store.planWeek(weekNo) || {};
    const phase = MT.PLAN.phases[week.phase] || MT.PLAN.phases.base;

    return tpl.exercises.map(ex => {
      const base = ex.tier === 'mobility'
        ? { sets: 2, reps: ex.reps || '10', rpe: '—' }
        : phase.lift[ex.tier] || phase.lift.accessory;
      const presc = {
        sets: base.sets,
        reps: ex.reps && ex.tier !== 'mobility' ? ex.reps : base.reps,
        rpe: base.rpe
      };
      const w = suggestWeight(ex, presc, beforeDate);
      return {
        name: ex.name, tier: ex.tier, side: !!ex.side,
        sets: presc.sets, reps: presc.reps, rpe: presc.rpe,
        weight: w.weight, why: w.why
      };
    });
  }

  /** "4 × 5 @ 190 lb" / "3 × 8–10 · RPE 8" for a one-line display. */
  function lineFor(row) {
    const scheme = `${row.sets} × ${row.reps}`;
    if (row.tier === 'mobility') return scheme;
    if (row.weight == null) return `${scheme} · RPE ${row.rpe}`;
    return `${scheme} @ ${row.weight}${row.side ? '/side' : ''} lb`;
  }

  return { prescribe, suggestWeight, template, normalizeTag, repTarget, lineFor };
})();

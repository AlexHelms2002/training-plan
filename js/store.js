/* ------------------------------------------------------------------
 * store.js — everything you type lives here, in this browser only.
 *
 * Nothing is ever sent anywhere. The repo holds the code; your training
 * data stays in localStorage on the machine you use, and the Export
 * button writes a JSON backup wherever you want to keep it.
 * ------------------------------------------------------------------ */

window.MT = window.MT || {};

MT.store = (function () {
  // Deliberately still the old name: this key is where your existing
  // training data lives, and renaming it would orphan every workout
  // already logged in this browser.
  const KEY = 'marathon-tracker/v1';
  const listeners = [];
  let available = true;
  let data = null;

  function blank() {
    return {
      version: 1,
      planOverrides: {},   // weekNumber -> partial week object
      logs: {},            // 'YYYY-MM-DD' -> { runs:[], gym:[], notes:'' }
      settings: { lastTab: 'week' }
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      data = raw ? Object.assign(blank(), JSON.parse(raw)) : blank();
    } catch (err) {
      console.warn('Storage unavailable, running in memory only.', err);
      available = false;
      data = blank();
    }
    return data;
  }

  let saveTimer = null;
  function save(immediate) {
    clearTimeout(saveTimer);
    const write = () => {
      if (!available) return;
      try {
        localStorage.setItem(KEY, JSON.stringify(data));
      } catch (err) {
        available = false;
        console.error('Could not save to localStorage', err);
      }
    };
    immediate ? write() : (saveTimer = setTimeout(write, 250));
    listeners.forEach(fn => fn(data));
  }

  function onChange(fn) { listeners.push(fn); }

  /* --- logs ------------------------------------------------------ */

  function logFor(date, create) {
    if (!data.logs[date] && create) {
      data.logs[date] = { runs: [], gym: [], notes: '' };
    }
    return data.logs[date] || { runs: [], gym: [], notes: '' };
  }

  /** Drop a day that ended up with nothing in it. */
  function pruneDay(date) {
    const d = data.logs[date];
    if (d && !d.runs.length && !d.gym.length && !(d.notes || '').trim()) {
      delete data.logs[date];
    }
  }

  function loggedDates() {
    return Object.keys(data.logs).sort();
  }

  /** All log entries for one week number, as [{date, day, log}]. */
  function weekLogs(weekNo) {
    return MT.util.weekDates(weekNo).map(date => ({
      date,
      day: MT.util.dayName(date),
      log: data.logs[date] || null
    }));
  }

  /* --- exercise memory -------------------------------------------
   * The last time you did an exercise, so the next log can start from
   * it instead of from an empty row. Everything it fills is a normal
   * editable field.                                                  */

  function lastExercise(name, beforeDate) {
    const key = String(name || '').trim().toLowerCase();
    if (!key) return null;
    const dates = Object.keys(data.logs).sort().reverse();
    for (const d of dates) {
      if (beforeDate && d > beforeDate) continue;
      for (const sess of (data.logs[d].gym || [])) {
        const hit = (sess.rows || []).filter(r =>
          String(r.ex || '').trim().toLowerCase() === key && (r.weight || r.reps));
        if (hit.length) {
          // Heaviest row of that session — the working set, not the warm-up.
          const best = hit.sort((a, b) => (Number(b.weight) || 0) - (Number(a.weight) || 0))[0];
          return {
            date: d, sets: best.sets || '', reps: best.reps || '',
            weight: best.weight || '', perSide: !!best.perSide
          };
        }
      }
    }
    return null;
  }

  /* --- plan ------------------------------------------------------ */

  /** Base week from plan-data.js merged with any edits you've made. */
  function planWeek(n) {
    const base = MT.PLAN.weeks.find(w => w.n === n);
    if (!base) return null;
    return Object.assign({}, base, data.planOverrides[n] || {});
  }

  function setPlanOverride(n, patch) {
    const base = MT.PLAN.weeks.find(w => w.n === n) || {};
    const current = Object.assign({}, data.planOverrides[n], patch);
    // Drop keys that match the shipped plan again, so overrides stay small.
    for (const k of Object.keys(current)) {
      if (JSON.stringify(current[k]) === JSON.stringify(base[k])) delete current[k];
    }
    if (Object.keys(current).length) data.planOverrides[n] = current;
    else delete data.planOverrides[n];
    save();
  }

  function resetPlanWeek(n) {
    delete data.planOverrides[n];
    save(true);
  }

  /* --- backup ---------------------------------------------------- */

  function exportJSON() {
    const stamp = MT.util.today();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `training-plan-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function importJSON(text, mode) {
    const incoming = JSON.parse(text);
    if (!incoming || typeof incoming !== 'object' || !incoming.logs) {
      throw new Error('That file does not look like a tracker backup.');
    }
    if (mode === 'merge') {
      data.logs = Object.assign({}, data.logs, incoming.logs);
      data.planOverrides = Object.assign({}, data.planOverrides, incoming.planOverrides || {});
    } else {
      data = Object.assign(blank(), incoming);
    }
    save(true);
    return data;
  }

  function isAvailable() { return available; }
  function all() { return data; }

  load();

  return {
    all, save, onChange, logFor, pruneDay, loggedDates, weekLogs, lastExercise,
    planWeek, setPlanOverride, resetPlanWeek,
    exportJSON, importJSON, isAvailable
  };
})();

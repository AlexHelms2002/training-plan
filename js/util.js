/* ------------------------------------------------------------------
 * util.js — dates, times, paces, and tiny DOM helpers.
 * All dates are handled as local 'YYYY-MM-DD' strings so nothing ever
 * shifts a day because of a timezone.
 * ------------------------------------------------------------------ */

window.MT = window.MT || {};

MT.util = (function () {
  const DAY_MS = 86400000;
  const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  /* --- dates ----------------------------------------------------- */

  function parseDate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function toISO(date) {
    const p = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
  }

  function today() {
    return toISO(new Date());
  }

  function addDays(iso, n) {
    const d = parseDate(iso);
    d.setDate(d.getDate() + n);
    return toISO(d);
  }

  function daysBetween(isoA, isoB) {
    return Math.round((parseDate(isoB) - parseDate(isoA)) / DAY_MS);
  }

  /** Monday index: Mon = 0 … Sun = 6 */
  function dayIndex(iso) {
    return (parseDate(iso).getDay() + 6) % 7;
  }

  function dayName(iso) {
    return DAY_NAMES[dayIndex(iso)];
  }

  function mondayOf(iso) {
    return addDays(iso, -dayIndex(iso));
  }

  function fmtDate(iso, opts) {
    return parseDate(iso).toLocaleDateString(undefined,
      opts || { month: 'short', day: 'numeric' });
  }

  function fmtLongDate(iso) {
    return parseDate(iso).toLocaleDateString(undefined,
      { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }

  /* --- the training block ---------------------------------------- */

  /** Week number (1-based) for a date; null if outside the block. */
  function weekNumber(iso) {
    const diff = daysBetween(MT.PLAN.blockStart, mondayOf(iso));
    const n = Math.floor(diff / 7) + 1;
    return (n >= 1 && n <= MT.PLAN.weeksTotal) ? n : null;
  }

  function weekStart(n) {
    return addDays(MT.PLAN.blockStart, (n - 1) * 7);
  }

  function weekDates(n) {
    const start = weekStart(n);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }

  /* --- times & paces ---------------------------------------------
   * Accepts "45", "45:30", "1:05:20", "1h05", "45m30s".            */

  function parseTime(str) {
    if (!str) return null;
    const s = String(str).trim().toLowerCase();
    if (!s) return null;

    // 1h05m30s style
    const hms = s.match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\s*(?:(\d+)\s*s)?$/);
    if (hms && (hms[1] || hms[2] || hms[3])) {
      return (+(hms[1] || 0)) * 3600 + (+(hms[2] || 0)) * 60 + (+(hms[3] || 0));
    }

    const parts = s.split(':').map(p => p.trim());
    if (parts.some(p => p === '' || isNaN(Number(p)))) return null;
    const nums = parts.map(Number);
    if (nums.length === 1) return Math.round(nums[0] * 60);          // bare minutes
    if (nums.length === 2) return nums[0] * 60 + nums[1];            // mm:ss
    if (nums.length === 3) return nums[0] * 3600 + nums[1] * 60 + nums[2];
    return null;
  }

  function fmtTime(secs) {
    if (secs == null || !isFinite(secs)) return '';
    secs = Math.round(secs);
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    const p = n => String(n).padStart(2, '0');
    return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
  }

  /** Pace string for a distance in miles and a time string/seconds. */
  function pace(miles, time) {
    const secs = typeof time === 'number' ? time : parseTime(time);
    const mi = Number(miles);
    if (!secs || !mi || mi <= 0) return '';
    return fmtTime(secs / mi) + '/mi';
  }

  /** Distance parser that understands "800m", "1.5k", "3", "3 mi". */
  function parseDistance(str) {
    if (str == null || str === '') return null;
    const s = String(str).trim().toLowerCase();
    let m;
    if ((m = s.match(/^([\d.]+)\s*m$/)))  return +m[1] / 1609.34;
    if ((m = s.match(/^([\d.]+)\s*k(m)?$/))) return +m[1] * 0.621371;
    if ((m = s.match(/^([\d.]+)\s*(mi|miles?)?$/))) return +m[1];
    return null;
  }

  function round(n, places) {
    const f = Math.pow(10, places || 0);
    return Math.round(n * f) / f;
  }

  /* --- DOM ------------------------------------------------------- */

  /** el('div', {class:'x', onclick:fn}, [children | 'text']) */
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'text') node.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') {
          node.addEventListener(k.slice(2), v);
        } else if (k === 'value') node.value = v;
        else node.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const child of [].concat(children || [])) {
      if (child == null || child === false) continue;
      node.appendChild(typeof child === 'object' ? child
        : document.createTextNode(String(child)));
    }
    return node;
  }

  /** Same idea as el(), for SVG nodes. */
  function svg(tag, attrs, children) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'text') node.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') {
          node.addEventListener(k.slice(2), v);
        } else node.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const child of [].concat(children || [])) {
      if (child == null || child === false) continue;
      node.appendChild(typeof child === 'object' ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  function clear(node) {
    if (!node) return node;
    // Let a focused field fire its change/blur handlers *before* it is
    // torn out of the document, not during the removal.
    const focused = document.activeElement;
    if (focused && focused !== document.body && node.contains(focused)) focused.blur();
    // replaceChildren avoids the removeChild race when a blur handler
    // fires mid-rerender.
    if (node.replaceChildren) node.replaceChildren();
    else node.innerHTML = '';
    return node;
  }

  function uid() {
    return Math.random().toString(36).slice(2, 10);
  }

  return {
    DAY_NAMES, parseDate, toISO, today, addDays, daysBetween, dayIndex,
    dayName, mondayOf, fmtDate, fmtLongDate, weekNumber, weekStart,
    weekDates, parseTime, fmtTime, pace, parseDistance, round,
    el, svg, clear, uid
  };
})();

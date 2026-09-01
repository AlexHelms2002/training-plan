/* ------------------------------------------------------------------
 * app.js — tabs, header, backup buttons, boot.
 * ------------------------------------------------------------------ */

window.MT = window.MT || {};

MT.app = (function () {
  const U = MT.util;
  const panels = {
    week: { el: null, view: () => MT.suggest },
    plan: { el: null, view: () => MT.plan },
    log:  { el: null, view: () => MT.log },
    insights: { el: null, view: () => MT.insights }
  };
  let active = 'week';

  /* --- tabs -------------------------------------------------------- */

  function show(name) {
    if (!panels[name]) name = 'week';
    active = name;
    Object.entries(panels).forEach(([key, p]) => {
      p.el.hidden = key !== name;
      document.querySelector(`.tab[data-tab="${key}"]`)
        .setAttribute('aria-selected', String(key === name));
    });
    panels[name].view().render(panels[name].el);
    updateHeader();
    MT.store.all().settings.lastTab = name;
    MT.store.save();
    window.scrollTo({ top: 0 });
  }

  /** Re-render the tabs that didn't cause the change, so the numbers
   *  on the other tabs are never stale. */
  function refreshOthers(source) {
    Object.entries(panels).forEach(([key, p]) => {
      if (key === source || !p.el) return;
      if (key === active) p.view().render(p.el);
      else U.clear(p.el);   // rebuilt on next show()
    });
    updateHeader();
  }

  /* --- header ------------------------------------------------------ */

  function updateHeader() {
    const wrap = document.getElementById('header-stats');
    const sub = document.getElementById('header-sub');
    const n = U.weekNumber(U.today());
    const daysToRace = U.daysBetween(U.today(), MT.PLAN.raceDate);

    sub.textContent = n
      ? `Week ${n} of ${MT.PLAN.weeksTotal} · ${MT.PLAN.phases[MT.store.planWeek(n).phase].name}`
      : `Block: ${U.fmtDate(MT.PLAN.blockStart)} – ${U.fmtDate(MT.PLAN.raceDate)}`;

    U.clear(wrap);
    const stat = (v, k) => U.el('div', { class: 'stat' }, [
      U.el('div', { class: 'v', text: v }), U.el('div', { class: 'k', text: k })
    ]);

    if (n) {
      const b = MT.week.breakdown(n);
      const a = MT.week.actuals(n);
      // Denominator is the required sessions; an optional one you do
      // still counts on the top.
      const required = b.gym.filter(g => !g.optional);
      const gymDone = b.gym.filter(g => a.gymDone[g.id]).length;
      wrap.appendChild(stat(`${a.miles}/${b.total}`, 'miles this week'));
      wrap.appendChild(stat(`${gymDone}/${required.length}`, 'lifts this week'));
    }
    wrap.appendChild(stat(daysToRace > 0 ? daysToRace : '—', 'days to race'));
  }

  /* --- toast ------------------------------------------------------- */

  let toastTimer = null;
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  /* --- backup ------------------------------------------------------ */

  function wireBackup() {
    document.getElementById('btn-export').addEventListener('click', () => {
      MT.store.exportJSON();
      toast('Backup downloaded');
    });

    const file = document.getElementById('file-import');
    document.getElementById('btn-import').addEventListener('click', () => file.click());

    file.addEventListener('change', () => {
      const f = file.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const merge = confirm(
            'OK = merge this backup into what\'s already here.\n' +
            'Cancel = replace everything with the backup.');
          MT.store.importJSON(reader.result, merge ? 'merge' : 'replace');
          MT.suggest.reset();
          show(active);
          toast(merge ? 'Backup merged' : 'Data replaced');
        } catch (err) {
          alert('Could not import that file: ' + err.message);
        }
        file.value = '';
      };
      reader.readAsText(f);
    });
  }

  /* --- boot -------------------------------------------------------- */

  function init() {
    panels.week.el = document.getElementById('tab-week');
    panels.plan.el = document.getElementById('tab-plan');
    panels.log.el  = document.getElementById('tab-log');
    panels.insights.el = document.getElementById('tab-insights');

    document.querySelectorAll('.tab').forEach(btn =>
      btn.addEventListener('click', () => show(btn.dataset.tab)));

    wireBackup();

    if (!MT.store.isAvailable()) {
      document.querySelector('main').prepend(U.el('div', { class: 'card', style: 'border-color:var(--warn)' }, [
        U.el('b', { text: 'Storage is blocked in this browser.' }),
        U.el('p', { class: 'small muted', style: 'margin:4px 0 0', text:
          'Anything you type will be lost when you close the tab. Serving the folder over http://localhost instead of opening the file directly usually fixes it — see the README.' })
      ]));
    }

    show(MT.store.all().settings.lastTab || 'week');

    // Keyboard: 1–4 switch tabs when you're not typing in a field.
    document.addEventListener('keydown', e => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
      if (e.key === '1') show('week');
      if (e.key === '2') show('plan');
      if (e.key === '3') show('log');
      if (e.key === '4') show('insights');
    });
  }

  return { init, show, refreshOthers, updateHeader, toast };
})();

document.addEventListener('DOMContentLoaded', MT.app.init);

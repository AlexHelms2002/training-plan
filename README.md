# Road to March

A local marathon + gym tracker for a 28-week block ending Sunday 14 March 2027.

Four tabs:

- **This Week** — compares the week's plan against what you've actually logged and lays out the days you have left.
- **Plan** — all 28 weeks, by week rather than by day: weekly mileage, long run, the one quality session, and which lifts to hit. Every week is editable.
- **Log** — one day at a time. Any day takes any number of runs *and* gym sessions, so double days are just two entries.
- **Insights** — is it working? Weekly mileage against the plan, easy-run pace by week, gym
  volume by week, and estimated 1RM for any single exercise you've logged more than once.

No build step, no dependencies, no accounts. Plain HTML, CSS and JavaScript.

## Running it

```bash
git clone <your-repo-url>
cd training-plan
python3 -m http.server 8000     # or: npx serve .
```

Then open <http://localhost:8000>.

Opening `index.html` directly by double-clicking works too, but some browsers refuse to keep
`localStorage` for `file://` pages — if the app warns that storage is blocked, use the local
server above.

## Your data

**Training data never goes into git.** Everything you type is saved in your browser's
`localStorage`, on the machine you typed it on. The repo only holds the code.

- **Export** writes `training-plan-backup-YYYY-MM-DD.json` to your downloads. Keep those
  somewhere outside the repo — a cloud drive is ideal.
- **Import** takes one back, and asks whether to merge it with what's already there or replace
  everything.
- Different browser or different laptop = different data. Export/import is how you move it.
- `.gitignore` already blocks `*.json` backups and a `data/` folder, so an accidental
  `git add .` can't publish your log.

## Changing the plan

Two ways, and they don't fight each other:

| What | Where | Survives a `git pull` |
|---|---|---|
| Tweak one week (mileage, long run, quality session, which lifts, focus) | In the app, on the Plan tab | Yes — saved as an override in your browser |
| Change the program itself, gym templates, phases, race date | `js/plan-data.js` | It *is* the repo |

A week you've edited shows an `edited` pill and a **Reset this week** button that drops your
override and goes back to whatever `plan-data.js` says.

## Two shortcuts that save typing

Both only ever *fill in* fields — everything they write is a normal editable entry.

- **Log planned** (This Week tab, on each day) drafts that day's entry from the plan: the run
  with its name, type and target mileage, and the gym session with its exercises loaded. A
  quality session like "6 × 800m @ 5K pace" also arrives with six rep rows, distances filled,
  waiting for times. It skips whichever half you've already logged, so clicking twice can't
  duplicate anything. **Blank** opens the day empty instead.
- **Weight memory** — a gym row whose exercise name matches something you've logged before gets
  its sets, reps and weight prefilled: sets and reps from the phase, weight from the last
  session you did it (the heaviest set, not the warm-up) moved by the progression rule below.
  Happens on "Load exercises", on "Log planned", and whenever you type an exercise name into an
  empty row.

## The gym sessions

Five categories, in `js/plan-data.js`: **Push**, **Pull**, **Shoulders**, **Legs**,
**Mobility / Core**. Four run each week and the fifth is marked optional — through Base and
Build I that's Mobility, and once Build II starts it flips, because when the miles peak the
runner-specific leg work matters more than another shoulder day.

Sets and reps come from the phase, not from the exercise, so the whole gym plan gets lighter as
the running gets heavier:

| Phase | Main lifts | Accessories |
|---|---|---|
| Base | 4 × 5 @ RPE 8 | 3 × 8–10 @ RPE 8 |
| Build I | 3 × 5 @ RPE 7–8 | 3 × 8–10 |
| Build II | 3 × 6 @ RPE 6–7 | 2 × 10–12 @ RPE 6 |
| Sharpen | 2 × 5 @ RPE 6 | 2 × 10 |
| Race / Taper | bodyweight and mobility only | |

RPE is effort measured as **reps in reserve** — RPE 8 means you stopped two reps short of
failure. The Plan tab carries the full scale (open **full scale** on the block card at the top).
It's used instead of percentages because it self-corrects: the week after a 20-miler, RPE 8 is
simply a lighter bar than it was fresh.

**Weights are never invented.** They come from the last time you logged that exercise:

- hit the rep target → **+5 lb** (upper) or **+10 lb** (lower body)
- beat it by 2 or more → the rep target dropped this phase, so **go ~5% heavier**
- fell short → **repeat the same weight** until you own it
- nothing logged yet → no number, just the RPE to aim for

Hover any exercise row and it tells you why it's suggesting that number. The whole prescription
shows on the Plan tab (expand a week) and on This Week (**show lifts** on any gym day), and
"Log planned" / "Load exercises" fill it straight into the log, where you can change anything.

## How the suggestions work

All the logic is in `js/week.js` — pure functions, no DOM, so it's easy to read and easy to
change. For the current week it:

1. takes the week's target mileage, long run, quality session and gym list;
2. splits the mileage — long run gets its distance, quality takes ~34% of the remainder, the
   rest is easy running;
3. reads the log for Mon–Sun and works out what's already done (a run counts as the long run if
   it's tagged `long` or is at least 90% of the planned distance; a gym session counts toward a
   planned session when it's tagged with that session);
4. schedules what's missing across the days that are left — long run on Saturday if it's still
   ahead, quality as early as possible and not the day before the long run, lower-body lifts
   away from the long run, easy miles spread over the rest, capped at 8 mi/day;
5. adds notes when you're ahead, behind, or about to do something ill-advised.

## Files

```
index.html            markup and script tags — that's all
css/styles.css        one stylesheet, light + dark
js/plan-data.js       THE PROGRAM: 28 weeks, gym templates, phases
js/util.js            dates, time/pace parsing, tiny DOM helper
js/store.js           localStorage read/write, export/import
js/week.js            the rules engine (plan vs. actual → what's left)
js/gym.js             sets/reps by phase + weight suggestions from your history
js/plan.js            Plan tab
js/log.js             Log tab
js/suggest.js         This Week tab
js/insights.js        Insights tab — charts are hand-drawn SVG, no library
```

## Handy details

- Times parse loosely: `48:20`, `1:32:05`, `45` (minutes), `1h05m` all work. Pace is computed
  for you.
- Interval distances take `800m`, `1k` or `1.5` (miles).
- Gym rows are exercise · **sets** (dropdown, 1–5) · **reps** (type anything) · weight.
- `↻` on a gym row repeats that exercise as another line with the same sets, reps and weight —
  handy when the weight changes between sets.
- **per side** on a gym row means the weight is per arm/leg rather than the total.
- Keys `1` `2` `3` `4` switch tabs when you're not typing in a field.
- Every chart has a hover readout and a **Show data** button that prints the same numbers as a
  table — nothing is locked behind the picture.
- Running metrics are always blue and gym metrics always orange, on every chart, in both light
  and dark mode. The two hues are checked for colour-blind separation.
- Estimated 1RM uses Epley (`weight × (1 + reps/30)`) on the heaviest set of each session, so a
  heavy triple and a light set of ten are comparable.

## Deploying it

It's static, so anything that serves files works: GitHub Pages, Netlify, a Raspberry Pi on your
desk. Note that data lives per-browser, so a phone visiting a hosted copy starts empty — use
Export/Import to move a snapshot over.

/* ------------------------------------------------------------------
 * plan-data.js — the training block, as plain data.
 *
 * This is the only file you need to edit to change the shape of the
 * program itself. Everything the app shows on the Plan tab comes from
 * here; anything you tweak inside the app is stored separately as an
 * override, so editing this file never wipes your own changes.
 * ------------------------------------------------------------------ */

window.MT = window.MT || {};

MT.PLAN = {
  /* Block anchors -------------------------------------------------- */
  blockStart: '2026-08-31',   // Monday, week 1 day 1
  raceDate:   '2027-03-14',   // Sunday, race day
  raceName:   'Marathon',
  weeksTotal: 28,

  /* Phase definitions ----------------------------------------------
   * `lift` is the prescription for that phase: main lifts (the barbell
   * movements) and accessories (everything else). Sets stay at 4 or
   * fewer so they fit the log's sets dropdown.
   * RPE = reps in reserve, roughly: RPE 8 means you could have done 2
   * more. Marathon training is the priority, so load comes down as
   * running volume goes up.                                          */
  phases: {
    base: {
      name: 'Base', color: '#4f9d69',
      liftLoad: 'Heavy — build strength while running is still light. RPE 8: two reps left in the tank.',
      lift: { main: { sets: 4, reps: '5', rpe: '8' }, accessory: { sets: 3, reps: '8–10', rpe: '8' } }
    },
    build1: {
      name: 'Build I', color: '#3f7cac',
      liftLoad: 'Hold your loads. RPE 7–8, maintain rather than chase PRs — the miles are climbing.',
      lift: { main: { sets: 3, reps: '5', rpe: '7–8' }, accessory: { sets: 3, reps: '8–10', rpe: '7–8' } }
    },
    build2: {
      name: 'Build II', color: '#c77d3a',
      liftLoad: 'Lighter and higher rep, ~75% of your Base loads. RPE 6–7. Legs stay fresh for running.',
      lift: { main: { sets: 3, reps: '6', rpe: '6–7' }, accessory: { sets: 2, reps: '10–12', rpe: '6' } }
    },
    sharpen: {
      name: 'Sharpen', color: '#a4508b',
      liftLoad: 'Movement quality only, ~70% of Base. RPE 6, never near failure.',
      lift: { main: { sets: 2, reps: '5', rpe: '6' }, accessory: { sets: 2, reps: '10', rpe: '5–6' } }
    },
    taper: {
      name: 'Race / Taper', color: '#c0392b',
      liftLoad: 'Bodyweight and mobility only. Nothing new, nothing heavy, nothing sore.',
      lift: { main: { sets: 2, reps: '8', rpe: '5' }, accessory: { sets: 2, reps: '10', rpe: '5' } }
    }
  },

  /* Gym session templates ------------------------------------------
   * Five categories; the weeks below pick which ones run each phase.
   *   tier   'main' takes the phase's main-lift prescription,
   *          'accessory' the accessory one, 'mobility' uses its own reps
   *   step   how much to add when you hit all your reps (lb)
   *   side   logged per arm/leg rather than as a total
   *   lower  leg work — the scheduler keeps it away from the long run
   * `id` is what the log tags a session with, so the app can tell which
   * planned session you did.                                         */
  gym: {
    push: {
      id: 'push', name: 'Push', focus: 'Chest, triceps, front delts',
      exercises: [
        { name: 'Bench press',            tier: 'main',      step: 5 },
        { name: 'Incline dumbbell press', tier: 'accessory', step: 5, side: true },
        { name: 'Dip',                    tier: 'accessory', step: 5 },
        { name: 'Cable fly',              tier: 'accessory', step: 5 },
        { name: 'Overhead triceps extension', tier: 'accessory', step: 5 }
      ]
    },
    pull: {
      id: 'pull', name: 'Pull', focus: 'Back, biceps, rear delts',
      exercises: [
        { name: 'Barbell row',        tier: 'main',      step: 5 },
        { name: 'Pull-up',            tier: 'main',      step: 5 },
        { name: 'Chest-supported row', tier: 'accessory', step: 5 },
        { name: 'Face pull',          tier: 'accessory', step: 5 },
        { name: 'Dumbbell curl',      tier: 'accessory', step: 5, side: true }
      ]
    },
    shoulders: {
      id: 'shoulders', name: 'Shoulders', focus: 'Overhead strength and posture',
      exercises: [
        { name: 'Overhead press',     tier: 'main',      step: 5 },
        { name: 'Seated DB press',    tier: 'accessory', step: 5, side: true },
        { name: 'Lateral raise',      tier: 'accessory', step: 5, side: true },
        { name: 'Rear-delt fly',      tier: 'accessory', step: 5, side: true },
        { name: 'Farmer carry',       tier: 'accessory', step: 10, side: true, reps: '40 yd' }
      ]
    },
    legs: {
      id: 'legs', name: 'Legs', focus: 'Runner-specific strength — the injury insurance',
      lower: true,
      exercises: [
        { name: 'Back squat',            tier: 'main',      step: 10 },
        { name: 'Romanian deadlift',     tier: 'main',      step: 10 },
        { name: 'Bulgarian split squat', tier: 'accessory', step: 5, side: true },
        { name: 'Hip thrust',            tier: 'accessory', step: 10 },
        { name: 'Eccentric calf raise',  tier: 'accessory', step: 10, reps: '12–15' }
      ]
    },
    mobility: {
      id: 'mobility', name: 'Mobility / Core', focus: 'Twenty minutes that keep you running',
      exercises: [
        { name: 'Dead bug',            tier: 'mobility', reps: '10/side' },
        { name: 'Side plank',          tier: 'mobility', reps: '30–45s/side' },
        { name: 'Copenhagen plank',    tier: 'mobility', reps: '20s/side' },
        { name: 'Glute bridge',        tier: 'mobility', reps: '15' },
        { name: 'Hip flexor stretch',  tier: 'mobility', reps: '45s/side' },
        { name: 'Ankle mobility drill', tier: 'mobility', reps: '10/side' }
      ]
    }
  },

  /* Old session ids, so anything logged before the split still reads. */
  gymAliases: { upperA: 'push', upperB: 'pull', lowerA: 'legs', lowerB: 'legs' },

  /* The 28 weeks ---------------------------------------------------
   * miles     — total running volume for the week
   * long      — long run distance
   * quality   — the one hard session of the week
   * gym       — which sessions to hit; `opt: true` = drop it first if
   *             the legs are cooked
   * cutback   — recovery week (volume steps back on purpose)
   * focus     — the one thing to pay attention to that week          */
  weeks: [
    { n: 1,  phase: 'base',    miles: 16, long: 6,    cutback: false, quality: '4 × 20s hill strides after an easy run',           gym: ['push','pull','legs','shoulders',{ id:'mobility', opt:true }], focus: 'Easy means easy. Set the habit, not the pace.' },
    { n: 2,  phase: 'base',    miles: 18, long: 7,    cutback: false, quality: '6 × 20s strides + 10 min steady',                  gym: ['push','pull','legs','shoulders',{ id:'mobility', opt:true }], focus: 'Protein 0.7–0.9 g/lb every day — start weighing it once.' },
    { n: 3,  phase: 'base',    miles: 20, long: 8,    cutback: false, quality: '2 × 10 min steady @ comfortably hard',             gym: ['push','pull','legs','shoulders',{ id:'mobility', opt:true }], focus: 'Lift heavy while running is still light.' },
    { n: 4,  phase: 'base',    miles: 15, long: 6,    cutback: true,  quality: '6 × 20s strides',                                  gym: ['push','pull','legs','shoulders',{ id:'mobility', opt:true }], focus: 'Cutback week. Sleep is the workout.' },
    { n: 5,  phase: 'base',    miles: 22, long: 9,    cutback: false, quality: '3 × 8 min tempo, 2 min jog',                       gym: ['push','pull','legs','shoulders',{ id:'mobility', opt:true }], focus: 'First real tempo. Effort-based, not watch-based.' },
    { n: 6,  phase: 'base',    miles: 24, long: 10,   cutback: false, quality: '20 min continuous tempo',                          gym: ['push','pull','legs','shoulders',{ id:'mobility', opt:true }], focus: 'Double-digit long run. Practice fueling before you need it.' },
    { n: 7,  phase: 'build1',  miles: 26, long: 11,   cutback: false, quality: '4 × 5 min @ 10K effort, 90s jog',                  gym: ['push','pull','legs','shoulders',{ id:'mobility', opt:true }], focus: 'Volume climbs — shoe rotation and easy-day discipline.' },
    { n: 8,  phase: 'build1',  miles: 20, long: 8,    cutback: true,  quality: '6 × 20s strides + 10 min steady',                  gym: ['push','pull','legs','shoulders',{ id:'mobility', opt:true }], focus: 'Cutback. Check for niggles before they become injuries.' },
    { n: 9,  phase: 'build1',  miles: 28, long: 12,   cutback: false, quality: '5 × 1K @ 10K pace, 2 min jog',                     gym: ['push','pull','legs','shoulders',{ id:'mobility', opt:true }], focus: 'Start taking 30–60 g carbs/hr on the long run.' },
    { n: 10, phase: 'build1',  miles: 30, long: 13,   cutback: false, quality: '25 min tempo',                                     gym: ['push','pull','legs','shoulders',{ id:'mobility', opt:true }], focus: '30 mi week. Keep 80% of it genuinely easy.' },
    { n: 11, phase: 'build1',  miles: 32, long: 14,   cutback: false, quality: '6 × 800m @ 5K pace, 90s jog',                      gym: ['push','pull','legs','shoulders',{ id:'mobility', opt:true }], focus: 'Leg day stays submaximal from here — no grinding reps.' },
    { n: 12, phase: 'build1',  miles: 24, long: 10,   cutback: true,  quality: '2 × 10 min tempo',                                 gym: ['push','pull','legs','shoulders',{ id:'mobility', opt:true }], focus: 'Cutback. Good week to reassess paces.' },
    { n: 13, phase: 'build1',  miles: 33, long: 15,   cutback: false, quality: '2 × 15 min @ half-marathon effort, 3 min jog',     gym: ['push','pull','legs','shoulders',{ id:'mobility', opt:true }], focus: 'Long run fueling should feel routine now.' },
    { n: 14, phase: 'build1',  miles: 34, long: 16,   cutback: false, quality: '30 min tempo',                                     gym: ['push','pull','legs','shoulders',{ id:'mobility', opt:true }], focus: 'Biggest week of Build I. Eat accordingly.' },
    { n: 15, phase: 'build2',  miles: 30, long: 12,   cutback: true,  quality: '5 × 3 min @ 5K effort, 2 min jog',                 gym: ['push','pull','legs','mobility',{ id:'shoulders', opt:true }], focus: 'Build II opens light. Lifting drops to maintenance.' },
    { n: 16, phase: 'build2',  miles: 36, long: 17,   cutback: false, quality: '3 × 2 mi @ marathon pace, 3 min jog',              gym: ['push','pull','legs','mobility',{ id:'shoulders', opt:true }], focus: 'First real marathon-pace work. Learn the feel.' },
    { n: 17, phase: 'build2',  miles: 38, long: 18,   cutback: false, quality: '35 min tempo @ HM effort',                         gym: ['push','pull','legs','mobility',{ id:'shoulders', opt:true }], focus: 'Settle on a race-morning breakfast and stop experimenting.' },
    { n: 18, phase: 'build2',  miles: 30, long: 12,   cutback: true,  quality: '6 × 800m @ 5K pace, 90s jog',                      gym: ['push','pull','legs','mobility',{ id:'shoulders', opt:true }], focus: 'Cutback. No calorie deficit through this phase.' },
    { n: 19, phase: 'build2',  miles: 38, long: 18,   cutback: false, quality: '2 × 3 mi @ marathon pace, 5 min jog',              gym: ['push','pull','legs','mobility',{ id:'shoulders', opt:true }], focus: 'Dress-rehearse the long run: same kit, same fuel, same time of day.' },
    { n: 20, phase: 'build2',  miles: 40, long: 20,   cutback: false, quality: 'Inside the 20-miler: last 6 mi @ marathon pace',   gym: ['push','pull','legs','mobility',{ id:'shoulders', opt:true }], focus: '20-miler #1. Peak volume — recovery is the priority all week.' },
    { n: 21, phase: 'build2',  miles: 32, long: 13,   cutback: true,  quality: '4 × 1 mi @ HM pace, 2 min jog',                    gym: ['push','pull','legs','mobility',{ id:'shoulders', opt:true }], focus: 'Cutback after the 20. Don\'t be a hero.' },
    { n: 22, phase: 'build2',  miles: 40, long: 20,   cutback: false, quality: 'Inside the 20-miler: 3 × 3 mi @ marathon pace',    gym: ['push','pull','legs','mobility',{ id:'shoulders', opt:true }], focus: '20-miler #2, the hardest workout of the block.' },
    { n: 23, phase: 'build2',  miles: 38, long: 16,   cutback: false, quality: '40 min tempo',                                     gym: ['push','pull','legs','mobility',{ id:'shoulders', opt:true }], focus: 'Legs will feel flat. That\'s expected — keep easy days easy.' },
    { n: 24, phase: 'build2',  miles: 33, long: 14,   cutback: true,  quality: '5 × 1K @ 10K pace, 2 min jog',                     gym: ['push','pull','legs','mobility',{ id:'shoulders', opt:true }], focus: 'Cutback before the last big one.' },
    { n: 25, phase: 'sharpen', miles: 40, long: 20,   cutback: false, quality: 'Inside the 20-miler: 10 mi @ marathon pace',       gym: ['push','pull','mobility',{ id:'legs', opt:true }], focus: '20-miler #3 and the last hard week. Full race simulation.' },
    { n: 26, phase: 'sharpen', miles: 34, long: 16,   cutback: false, quality: '2 × 3 mi @ marathon pace + 4 × 200m strides',      gym: ['push','pull','mobility'],          focus: 'Volume starts down, intensity stays. Sharpening begins.' },
    { n: 27, phase: 'taper',   miles: 25, long: 12,   cutback: true,  quality: '3 × 1 mi @ marathon pace, 2 min jog',              gym: ['push','mobility'],                 focus: 'Taper. You will feel sluggish and doubt everything. Normal.' },
    { n: 28, phase: 'taper',   miles: 26.2, long: 26.2, cutback: false, quality: 'Wed shakeout: 3 mi w/ 6 × 100m strides',         gym: ['mobility'],                        focus: 'RACE WEEK — Sunday. Carbs up Fri/Sat, legs up, nothing new.' }
  ]
};

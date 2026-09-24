// Film time <-> story time.
// The shield tear is a 0.8 s story moment (267.2–268.0) that plays out over 10.8 s of screen time in first person.
// Everything after it is shifted by INSERT_EXTRA seconds. All choreography/audio tables are written in STORY time;
// the player clock is FILM time.
export const TEAR_S0 = 267.2, TEAR_S1 = 268.0;          // story window
export const TEAR_F1 = 278.0;                           // film time when the tear window ends
export const INSERT_EXTRA = (TEAR_F1 - TEAR_S0) - (TEAR_S1 - TEAR_S0);   // 10.0 s
export const STORY_DURATION = 387;   // title card holds ~15 s
export const FILM_DURATION = STORY_DURATION + INSERT_EXTRA;               // 392

// progress shape inside the window: a long struggle, then the barrier gives way at the end
const shape = (u) => 0.3 * u + 0.7 * Math.pow(u, 5);
function shapeInv(y) { let lo = 0, hi = 1; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (shape(m) < y) lo = m; else hi = m; } return (lo + hi) / 2; }

export function storyT(film) {
  if (film <= TEAR_S0) return film;
  if (film < TEAR_F1) return TEAR_S0 + (TEAR_S1 - TEAR_S0) * shape((film - TEAR_S0) / (TEAR_F1 - TEAR_S0));
  return film - INSERT_EXTRA;
}
export function filmT(story) {
  if (story <= TEAR_S0) return story;
  if (story < TEAR_S1) return TEAR_S0 + (TEAR_F1 - TEAR_S0) * shapeInv((story - TEAR_S0) / (TEAR_S1 - TEAR_S0));
  return story + INSERT_EXTRA;
}
/** 0..1 progress through the stretched first-person tear (film based), or -1 outside */
export function tearU(film) { return film > TEAR_S0 && film < TEAR_F1 ? (film - TEAR_S0) / (TEAR_F1 - TEAR_S0) : -1; }

// Easy-to-say starting passwords made of two tree names, e.g. "oak-maple".
// Used by the Admin page (new members, password resets) and functions/scripts/seed.mjs.
// They're meant to be changed on the Account page after the first login.
export const TREES = [
  "oak", "maple", "elm", "ash", "birch", "cedar", "pine", "spruce", "willow", "linden",
  "beech", "holly", "hazel", "alder", "aspen", "cherry", "walnut", "poplar", "larch", "magnolia",
  "ginkgo", "hemlock", "juniper", "sycamore", "dogwood", "redbud", "hickory", "chestnut", "locust", "catalpa",
  "cypress", "yew", "fir", "laurel", "sassafras", "tupelo", "hawthorn", "mulberry", "redwood", "katsura",
];

/** randInt(n) must return a random integer in [0, n). Result is always at least 8 characters. */
export function treePassword(randInt) {
  for (;;) {
    const a = TREES[randInt(TREES.length)], b = TREES[randInt(TREES.length)];
    const pw = `${a}-${b}`;
    if (a !== b && pw.length >= 8) return pw;
  }
}

/** Browser-side random integer in [0, n). */
export const browserRandInt = n => crypto.getRandomValues(new Uint32Array(1))[0] % n;

// Wilson score interval for a binomial proportion. Unlike the normal approximation it stays inside 0 to 1
// and gives a useful lower bound when every case succeeded (21 of 21), which is common on a small labelled set.
export function wilson(successes: number, n: number, z = 1.96): { low: number; high: number } | null {
  if (n === 0) return null;
  const p = successes / n;
  const z2 = z * z;
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n);
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  // The bounds at 0 and 1 are exact; floating point would otherwise give 0.9999999999999999.
  return { low: successes === 0 ? 0 : centre - half, high: successes === n ? 1 : centre + half };
}

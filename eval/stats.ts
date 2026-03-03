// Welch's t-test for unequal variances — no external dependencies.

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function variance(xs: number[]): number {
  const m = mean(xs);
  return xs.reduce((sum, x) => sum + (x - m) ** 2, 0) / (xs.length - 1);
}

// Approximation of the two-tailed p-value from the t-distribution
// using the regularized incomplete beta function. Accurate enough
// for eval comparison with small sample sizes.
function betaIncomplete(x: number, a: number, b: number): number {
  // Continued fraction approximation (Lentz's method)
  const maxIter = 200;
  const eps = 1e-12;

  if (x === 0 || x === 1) return x;

  const lnBeta = lgamma(a) + lgamma(b) - lgamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta) / a;

  let f = 1;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < eps) d = eps;
  d = 1 / d;
  f = d;

  for (let i = 1; i <= maxIter; i++) {
    const m = i;
    // Even step
    let numerator = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
    d = 1 + numerator * d;
    if (Math.abs(d) < eps) d = eps;
    c = 1 + numerator / c;
    if (Math.abs(c) < eps) c = eps;
    d = 1 / d;
    f *= c * d;

    // Odd step
    numerator = -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + numerator * d;
    if (Math.abs(d) < eps) d = eps;
    c = 1 + numerator / c;
    if (Math.abs(c) < eps) c = eps;
    d = 1 / d;
    const delta = c * d;
    f *= delta;

    if (Math.abs(delta - 1) < eps) break;
  }

  return front * f;
}

function lgamma(x: number): number {
  // Lanczos approximation
  const g = 7;
  const coefs = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];

  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  }

  x -= 1;
  let sum = coefs[0];
  for (let i = 1; i < g + 2; i++) {
    sum += coefs[i] / (x + i);
  }

  const t = x + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(sum);
}

function tDistCdf(t: number, df: number): number {
  const x = df / (df + t * t);
  const ibeta = betaIncomplete(x, df / 2, 0.5);
  return 1 - 0.5 * ibeta;
}

/**
 * Welch's t-test (two-tailed). Returns p-value.
 * Returns null if either sample has < 2 elements or zero variance.
 */
export function welchTTest(a: number[], b: number[]): number | null {
  if (a.length < 2 || b.length < 2) return null;

  const va = variance(a);
  const vb = variance(b);

  if (va === 0 && vb === 0) return null;

  const na = a.length;
  const nb = b.length;

  const t = (mean(a) - mean(b)) / Math.sqrt(va / na + vb / nb);

  // Welch-Satterthwaite degrees of freedom
  const num = (va / na + vb / nb) ** 2;
  const denom = (va / na) ** 2 / (na - 1) + (vb / nb) ** 2 / (nb - 1);
  const df = num / denom;

  // Two-tailed p-value
  const cdf = tDistCdf(Math.abs(t), df);
  return 2 * (1 - cdf);
}

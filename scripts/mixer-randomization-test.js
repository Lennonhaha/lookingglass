/**
 * LookingGlass: Mixer Randomization Test
 * ────────────────────────────────────
 * Verifies mixer indistinguishability after adding
 * randomization to destroy the 50%-zero artifact.
 *
 * Fix: kron(A, R) where R is random full-rank, not kron(A, I₂).
 * Or equivalently: kron(A, I₂) + uniform noise.
 */

const { TensorOps } = require('../src/core/tensor-ops');
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

TensorOps.MOD = 3329n;
const Q = Number(TensorOps.MOD);
const SAMPLES = 20_000;
const EXPECTED = SAMPLES / Q;

function chi2Critical(df, alpha) {
  const z = alpha === 0.01 ? 2.3263 : 1.6449;
  return df * (1 - 2 / (9 * df) + z * Math.sqrt(2 / (9 * df))) ** 3;
}

/**
 * Generate a random k×k matrix over Z_q (non-diagonal, full-rank with high prob)
 */
function randomRect(n, m) {
  return Array.from({ length: n }, () =>
    Array.from({ length: m }, () => BigInt(Math.floor(Math.random() * Q)))
  );
}

function runTest(name, n, k, mixerFn, samples) {
  const observed = new Array(Q).fill(0);
  const t0 = performance.now();

  for (let i = 0; i < samples; i++) {
    const A = randomRect(n * k, n);
    const mixed = mixerFn(A, k).flat();
    const idx = Math.floor(Math.random() * mixed.length);
    observed[Number(mixed[idx])]++;
  }

  const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
  let chi2 = 0;
  for (let i = 0; i < Q; i++) {
    const diff = (observed[i] || 0) - EXPECTED;
    chi2 += (diff * diff) / EXPECTED;
  }

  const df = Q - 1;
  const crit01 = chi2Critical(df, 0.01);
  const w = Math.sqrt(chi2 / samples);
  const passed = chi2 <= crit01;

  const zeros = observed[0] || 0;
  const expectedZeros = EXPECTED;
  const zeroRatio = zeros / expectedZeros;

  console.log(`  ${name.padEnd(24)} χ²=${chi2.toFixed(0).padStart(5)} crit=${crit01.toFixed(0)} w=${w.toFixed(4)} zeros=${zeros}/${expectedZeros.toFixed(0)}=${zeroRatio.toFixed(2)}x ${passed ? '✅' : '❌'} ${elapsed}s`);

  return { name, n, k, chi2: chi2.toFixed(0), cohens_w: w.toFixed(4), zero_ratio: zeroRatio.toFixed(3), passed, elapsed_s: parseFloat(elapsed) };
}

console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log(`║  Mixer Randomization Test  (samples=${SAMPLES.toLocaleString()}, q=${Q})`);
console.log('╚══════════════════════════════════════════════════════════════════╝\n');

const results = [];

// 1. ORIGINAL: kron(A, I₂) — baseline (should FAIL)
results.push(runTest('kron(A,I₂) [ORIGINAL]', 8, 2, (A) => {
  const I2 = TensorOps.identity(2);
  return TensorOps.kron(A, I2);
}, SAMPLES));

// 2. FIX A: kron(A, R) where R is random 2×2 full-rank
results.push(runTest('kron(A,R_rand) [FIX-A]', 8, 2, (A, k) => {
  const R = randomRect(k, k);
  return TensorOps.kron(A, R);
}, SAMPLES));

// 3. FIX B: kron(A, I₂) + Gaussian noise
results.push(runTest('kron(A,I₂)+noise(σ=3) [FIX-B]', 8, 2, (A) => {
  const I2 = TensorOps.identity(2);
  const M = TensorOps.kron(A, I2);
  return M.map(row => row.map(v =>
    TensorOps.mod(v + BigInt(Math.round(TensorOps.gaussian(3.0) * 3)))
  ));
}, SAMPLES));

// 4. FIX C: kron(A, I₂) + uniform noise (stronger)
results.push(runTest('kron(A,I₂)+U(Z_q) [FIX-C]', 8, 2, (A) => {
  const I2 = TensorOps.identity(2);
  const M = TensorOps.kron(A, I2);
  return M.map(row => row.map(v =>
    TensorOps.mod(v + BigInt(Math.floor(Math.random() * Q)))
  ));
}, SAMPLES));

// 5. FIX D: Random matrix directly (control — SHOULD pass)
results.push(runTest('U(Z_q) [CONTROL]', 8, 2, (A, k) => {
  return randomRect(A.length * k, A[0].length * k);
}, SAMPLES));

// ═══ SUMMARY ═══
const allPassed = results.filter(r => r.name !== 'kron(A,I₂) [ORIGINAL]').every(r => r.passed);

console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log('║  VERDICT');
console.log('╚══════════════════════════════════════════════════════════════════╝');
const orig = results[0];
console.log(`\n  ORIGINAL kron(A,I₂): ${orig.passed ? 'PASSED' : 'FAILED'} (χ²=${orig.chi2})`);
console.log(`    → Structural artifact: 50% zeros. Major fix needed.\n`);
for (const r of results.slice(1)) {
  const icon = r.passed ? '✅' : '❌';
  console.log(`  ${icon} ${r.name}: ${r.passed ? 'PASSED (indistinguishable)' : 'FAILED'}  χ²=${r.chi2}`);
}

if (allPassed) {
  console.log('\n  ✅ All fixes produce statistically indistinguishable output.');
  console.log('     Recommended: Fix-A (kron with random R) — simplest, no noise growth.');
} else {
  console.log('\n  ⚠️  Some fixes still show deviation. Further investigation needed.');
}

const out = path.join(__dirname, '..', 'docs', 'mixer-randomization-results.json');
fs.writeFileSync(out, JSON.stringify({
  experiment: 'Mixer Randomization Test',
  timestamp: new Date().toISOString(),
  q: Q, samples: SAMPLES,
  results,
}, null, 2));
console.log(`\n📁 ${out}\n`);

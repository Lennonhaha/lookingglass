/**
 * LookingGlass: Layer Independence Statistical Test
 * ──────────────────────────────────────────────
 * Verifies DMH weakest link: Kronecker-mixer output vs uniform random.
 *
 * Strategy: test mixer CORE, not full chain.
 *   mixer(A) = kron(A, I₂) + randomizeView(sigma·noise)
 *   Compare element distribution of mixer output against U(Z_q).
 */

const { TensorOps } = require('../src/core/tensor-ops');
const { MirrorLayer } = require('../src/core/mirror-layer');
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

TensorOps.MOD = 3329n;
const Q = Number(TensorOps.MOD);
const SAMPLES = 50_000;
const EXPECTED = SAMPLES / Q; // ≈ 15.0 → sufficient for χ² (rule: >5)

function chi2Critical(df, alpha) {
  const z = alpha === 0.01 ? 2.3263 : 1.6449;
  return df * (1 - 2 / (9 * df) + z * Math.sqrt(2 / (9 * df))) ** 3;
}

function runMixerTest(n, sigma, samples) {
  const observed = new Array(Q).fill(0);
  const t0 = performance.now();

  // One MirrorLayer instance reused — tests the CORE mixing function
  const layer = new MirrorLayer({ n, layerIndex: 0, q: TensorOps.MOD, sigma });

  for (let i = 0; i < samples; i++) {
    // Fresh random A for each sample
    const A = TensorOps.randomTensor([n * 2, n], TensorOps.MOD);
    const result = layer.generate(A);
    const mixed = result.A_mirrored.flat();

    // Pick one random element
    const idx = Math.floor(Math.random() * mixed.length);
    const val = Number(mixed[idx]);
    observed[val]++;
  }

  const elapsed = ((performance.now() - t0) / 1000).toFixed(1);

  // χ² goodness-of-fit vs uniform
  let chi2 = 0;
  for (let i = 0; i < Q; i++) {
    const diff = (observed[i] || 0) - EXPECTED;
    chi2 += (diff * diff) / EXPECTED;
  }

  const df = Q - 1;
  const crit01 = chi2Critical(df, 0.01);
  const crit05 = chi2Critical(df, 0.05);
  const w = Math.sqrt(chi2 / samples);
  const passed01 = chi2 <= crit01;
  const passed05 = chi2 <= crit05;

  console.log(`   χ²=${chi2.toFixed(0)}  (crit₁%=${crit01.toFixed(0)}, crit₅%=${crit05.toFixed(0)})  w=${w.toFixed(5)}  ${passed01 ? '✅' : passed05 ? '⚠️' : '❌'}  ${elapsed}s`);

  return { n, sigma, samples, chi2: chi2.toFixed(0), df, critical_0_01: crit01.toFixed(0), critical_0_05: crit05.toFixed(0), passed_0_01: passed01, passed_0_05: passed05, cohens_w: w.toFixed(5), elapsed_s: parseFloat(elapsed) };
}

// ═══════════════════════════════════════════
console.log('╔══════════════════════════════════════════╗');
console.log('║  DMH Layer Independence Test           ║');
console.log('║  Kronecker-mixer ⋄ U(Z_q)              ║');
console.log(`║  Samples: ${SAMPLES.toLocaleString()}, q=${Q}            ║`);
console.log('╚══════════════════════════════════════════╝\n');

const configs = [
  { n: 8, sigma: 1.0 },
  { n: 8, sigma: 3.0 },
  { n: 16, sigma: 1.0 },
  { n: 16, sigma: 3.0 },
  { n: 16, sigma: 5.0 },
  { n: 32, sigma: 1.0 },
  { n: 32, sigma: 3.0 },
];

const results = [];
const tTotal = performance.now();

for (const c of configs) {
  process.stdout.write(`🔬 n=${c.n}, σ=${c.sigma}  `);
  results.push(runMixerTest(c.n, c.sigma, SAMPLES));
}

const totalS = ((performance.now() - tTotal) / 1000).toFixed(1);
const allPassed = results.every(r => r.passed_0_01);

console.log(`\n╔═══════════════════════════════════════════════════════════════╗`);
console.log(`║  SUMMARY                                      ${String(totalS).padStart(6)}s      ║`);
console.log(`╠═══════════════════════════════════════════════════════════════╣`);
console.log(`║  n     σ     χ²       crit₁%    w         result             ║`);
for (const r of results) {
  const s = r.passed_0_01 ? '✅ INDISTINGUISHABLE' : r.passed_0_05 ? '⚠️ MARGINAL' : '❌ DISTINGUISHABLE';
  console.log(`║  ${String(r.n).padEnd(5)} ${String(r.sigma).padEnd(5)} ${r.chi2.padEnd(8)} ${r.critical_0_01.padEnd(8)} ${r.cohens_w.padEnd(8)} ${s.padEnd(25)}║`);
}
console.log(`╚═══════════════════════════════════════════════════════════════╝`);

if (allPassed) {
  console.log('\n✅ DMH layer independence PASSES first-order statistical test.');
  console.log('   Kronecker-mixer output is indistinguishable from uniform at α=0.01.');
  console.log('   No evidence of statistical leakage across tested parameters.');
} else {
  console.log('\n⚠️  Some configurations show statistical deviation.');
  console.log('   See individual results above for details.');
}

const out = path.join(__dirname, '..', 'docs', 'independence-experiment-results.json');
fs.writeFileSync(out, JSON.stringify({
  experiment: 'DMH Layer Independence Test',
  timestamp: new Date().toISOString(),
  q: Q, samples: SAMPLES, expected_per_cell: EXPECTED,
  all_passed_at_0_01: allPassed,
  total_time_s: parseFloat(totalS),
  results,
}, null, 2));
console.log(`\n📁 ${out}\n`);

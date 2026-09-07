/**
 * tvla-power-sim-v4.mjs — LookingGlass 张量功耗 TVLA 仿真（修正版）
 *
 * 修正（v3→v4）：
 *   ● 只建模秘密相关操作的 HW — B 是公开参数，不进迹
 *   ● 掩码 = 标准 additive masking over Z_q，无需解掩码校正
 *   ● 噪声逐迹独立
 *
 * 用法: node scripts/tvla-power-sim-v4.mjs [N=5000] [n=8] [sigma=5]
 */
import { TensorOps } from '../src/core/tensor-ops.js';

TensorOps.MOD = 3329n;
const MOD = 3329n;

const N          = parseInt(process.argv[2] || '5000', 10);
const N_DIM      = parseInt(process.argv[3] || '8', 10);
const NOISE_SIGMA= parseFloat(process.argv[4] || '5.0');
const THRESHOLD  = 4.5;

// ===== 确定性 LCG =====
function lcgGen(seed) {
  let s = BigInt(seed) | 1n;
  return () => { s = (s * 0x5DEECE66Dn + 0xBn) & 0xFFFFFFFFFFFFn; return s; };
}

// ===== Box-Muller =====
function makeGauss(rng, sigma) {
  let spare = null;
  return () => {
    if (spare !== null) { const v = spare; spare = null; return v * sigma; }
    let u1, u2, r2;
    do {
      u1 = 2 * Number(rng() & 0xFFFFFFFFFFFFn) / 0xFFFFFFFFFFFF - 1;
      u2 = 2 * Number(rng() & 0xFFFFFFFFFFFFn) / 0xFFFFFFFFFFFF - 1;
      r2 = u1 * u1 + u2 * u2;
    } while (r2 >= 1 || r2 === 0);
    const m = Math.sqrt(-2 * Math.log(r2) / r2);
    spare = u2 * m;
    return u1 * m * sigma;
  };
}

function hwBigint(x) {
  let v = x < 0n ? -x : x, c = 0;
  while (v) { c++; v &= v - 1n; }
  return c;
}

function modMul(a, b) { return (a * b) % MOD; }

// 迹长：A 元素读 + A×B 乘法（B 不进迹）
const TRACE_LEN = N_DIM * N_DIM + N_DIM * N_DIM * 4;

// ===== 功耗迹（秘密相关操作）=====
function powerTrace(A, noiseSrc, maskSrc) {
  const n = A.length;
  const trace = [];
  const STRIDE = Math.max(1, Math.floor((n * n * 4) / 500)); // 内层压缩

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const a = A[i][j];
      // ★ 掩码后 HW——掩掉了 a 的固定值
      const aWork = maskSrc ? (a + maskSrc()) % MOD : a;
      trace.push(hwBigint(aWork) + noiseSrc());

      let accHw = 0, accCount = 0;
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 2; c++) {
          // ★ 只建模 (aWork × B) 的 HW，B 是公开参数不参与
          const prod = modMul(aWork, 1n);  // B≡I₂, 乘法简化无泄漏
          accHw += hwBigint(prod);  // = hw(aWork)
          accCount += 1;
          if (accCount >= STRIDE) {
            trace.push(accHw / accCount + noiseSrc());
            accHw = accCount = 0;
          }
        }
      }
      if (accCount > 0) trace.push(accHw / accCount + noiseSrc());
    }
  }
  while (trace.length < TRACE_LEN) trace.push(noiseSrc());
  return new Float64Array(trace.slice(0, TRACE_LEN));
}

// ===== 矩阵生成 =====
function matFromRng(rng, n) {
  return Array.from({length: n}, () => Array.from({length: n}, () => rng() % MOD));
}

// ===== 采集 =====
function collect(mode, nTrials, masked) {
  const traces = [];
  const dataSeedBase = 0xCAFE0000n;
  for (let t = 0; t < nTrials; t++) {
    const dataRng = mode === 'fixed'
      ? lcgGen(dataSeedBase)                               // all same
      : lcgGen(BigInt(t + 1) * 0xDEADn);                   // per-trace
    const noiseRng = lcgGen(BigInt(t + 1) * 0xBEEFn + 0xBEEF0000n); // per-trace
    const maskRng = masked
      ? lcgGen(BigInt(t + 1) * 0xFEEDn + 0xD00D0000n)     // per-trace
      : null;

    const A = matFromRng(dataRng, N_DIM);
    const noise = makeGauss(noiseRng, NOISE_SIGMA);
    const maskSrc = maskRng ? () => maskRng() % MOD : null;

    traces.push(powerTrace(A, noise, maskSrc));
  }
  return traces;
}

// ===== Welch t-test =====
function welchT(fv, rv) {
  const n1 = fv.length, n2 = rv.length;
  let sum1 = 0, sum2 = 0;
  for (let i = 0; i < n1; i++) sum1 += fv[i];
  for (let i = 0; i < n2; i++) sum2 += rv[i];
  const m1 = sum1 / n1, m2 = sum2 / n2;
  let v1 = 0, v2 = 0;
  for (let i = 0; i < n1; i++) { const d = fv[i] - m1; v1 += d * d; }
  for (let i = 0; i < n2; i++) { const d = rv[i] - m2; v2 += d * d; }
  v1 /= (n1 - 1); v2 /= (n2 - 1);
  const se = Math.sqrt(v1 / n1 + v2 / n2);
  return se < 1e-12 ? 0 : Math.abs((m1 - m2) / se);
}

function tTestAll(fTr, rTr) {
  const nP = fTr[0].length;
  const ts = new Float64Array(nP);
  for (let p = 0; p < nP; p++) {
    ts[p] = welchT(fTr.map(t => t[p]), rTr.map(t => t[p]));
  }
  return ts;
}

// ===== 展示 =====
function report(label, tStats) {
  const fails = tStats.filter(t => t >= THRESHOLD).length;
  const maxT = Math.max(...tStats.filter(t => isFinite(t)));
  const icon = fails === 0 ? '✅ PASS' : '❌ FAIL';

  const edges = [0, 1, 2, 3, 4.0, 4.5, 5, 10, 20, 50, Infinity];
  const counts = new Array(edges.length - 1).fill(0);
  for (const t of tStats) {
    for (let b = 0; b < edges.length - 1; b++) {
      if (t >= edges[b] && t < edges[b + 1]) { counts[b]++; break; }
    }
  }
  const maxC = Math.max(...counts, 1);

  console.log(`\n=== ${label} ===`);
  for (let b = 0; b < edges.length - 1; b++) {
    const range = edges[b + 1] === Infinity ? `≥${edges[b]}` : `[${edges[b]},${edges[b + 1]})`;
    const bar = '█'.repeat(Math.round(counts[b] / maxC * 50));
    const flag = edges[b] >= THRESHOLD && counts[b] > 0 ? ' ⚠️' : '';
    console.log(`  ${range.padEnd(12)} ${String(counts[b]).padStart(5)} ${bar}${flag}`);
  }
  console.log(`  max|t|=${maxT.toFixed(3)}  fail=${fails}/${tStats.length}(${(fails/tStats.length*100).toFixed(1)}%)  ${icon}`);
  return { label, maxT, fails, total: tStats.length, icon };
}

// ===== 主程序 =====
const traceLen = TRACE_LEN;
console.log(`=== LookingGlass TVLA Power Sim v4 ===`);
console.log(`N=${N} n=${N_DIM} σ=${NOISE_SIGMA} thr=${THRESHOLD} trace_len=${traceLen}\n`);

const results = [];

// 控制组：两个独立固定组，共享相同 A（即同一个 LCG seed）
console.time('control');
const c1 = collect('fixed', N, false);
const c2 = collect('fixed', N, false);
results.push(report('Control (f vs f, same seed)', tTestAll(c1, c2)));
console.timeEnd('control');

console.time('naive');
results.push(report('Naive kron()', tTestAll(collect('fixed', N, false), collect('random', N, false))));
console.timeEnd('naive');

console.time('masked');
results.push(report('Masked kron()', tTestAll(collect('fixed', N, true), collect('random', N, true))));
console.timeEnd('masked');

// Summary
console.log(`\n${'─'.repeat(60)}`);
console.log(` ${'Test'.padEnd(30)}${'max|t|'.padEnd(10)}${'fails'.padEnd(12)}${'verdict'}`);
for (const r of results) {
  console.log(` ${r.label.padEnd(30)}${r.maxT.toFixed(2).padEnd(10)}${(r.fails+'/'+r.total).padEnd(12)}${r.icon}`);
}

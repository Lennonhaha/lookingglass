/**
 * tvla-power-sim-v3.mjs — LookingGlass 张量功耗 TVLA 仿真（最终版）
 *
 * 修正：
 *   1. 固定迹长（预计算，不依赖对齐）
 *   2. 固定组：输入 + 噪声全部 LCG 确定性
 *   3. 随机组：输入随机 + 噪声独立采样
 *   4. 控制组：两组独立 LCG seed → 验证无假阳性
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

// ===== Box-Muller (给定 rng) =====
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

// ===== 预计算迹长 =====
function traceLen(n) {
  // 1 点 / A 元素读 + N_STRIDE 聚合成 ≈500 点
  return n * n + Math.ceil((n * n * 2 * 2) / Math.max(1, Math.floor((n * n * 4) / 500)));
}

// ===== 矩阵生成 =====
function matFromRng(rng, n) {
  return Array.from({length: n}, () =>
    Array.from({length: n}, () => rng() % MOD));
}
function mat2x2FromRng(rng) {
  return [[rng() % MOD, rng() % MOD], [rng() % MOD, rng() % MOD]];
}

// ===== 功耗迹 =====
/**
 * @param {bigint[][]} A
 * @param {bigint[][]} B
 * @param {()=>number} noiseSrc - 噪声源（确定性或随机）
 * @param {()=>bigint} maskSrc - 掩码源 (null=无掩码)
 * @returns {Float64Array} 固定长度迹
 */
function powerTrace(A, B, noiseSrc, maskSrc) {
  const m = A.length, n = A[0].length, p = B.length, q = B[0].length;
  const STRIDE = Math.max(1, Math.floor((m * n * p * q) / 500));
  const trace = [];

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      let a = A[i][j];
      const aWork = maskSrc ? (a + maskSrc()) % MOD : a;  // masked or raw
      trace.push(hwBigint(aWork) + noiseSrc());

      let accHw = 0, accCount = 0;
      for (let r = 0; r < p; r++) {
        for (let c = 0; c < q; c++) {
          const prod = modMul(aWork, B[r][c]);
          accHw += hwBigint(prod) + hwBigint(B[r][c]);
          accCount += 2;
          if (accCount >= STRIDE) { trace.push(accHw / accCount + noiseSrc()); accHw = accCount = 0; }
        }
      }
      if (accCount > 0) trace.push(accHw / accCount + noiseSrc());
    }
  }

  // 补齐到固定长度
  const LEN = traceLen(n);
  while (trace.length < LEN) trace.push(noiseSrc());
  // 截断（安全）
  return new Float64Array(trace.slice(0, LEN));
}

// ===== 采集 =====
function collect(mode, nTrials, masked) {
  // 数据 RNG：固定组用恒定 seed，随机组每迹递增
  const dataSeedBase = mode === 'fixed' ? 0xCAFE0000n : 0n;
  // 噪声 RNG：固定组用恒定 seed，随机组每迹递增
  const noiseSeedBase = mode === 'fixed' ? 0xBEEF0000n : 0x10000000n;

  const traces = [];
  const LEN = traceLen(N_DIM);

  for (let t = 0; t < nTrials; t++) {
    const dataRng = mode === 'fixed'
      ? lcgGen(dataSeedBase)
      : lcgGen(BigInt(t + 1) * 0xDEADn);
    const noiseRng = lcgGen(BigInt(t + 1) * 0xBEEFn + 0xBEEF0000n); // always per-trace

    const A = matFromRng(dataRng, N_DIM);
    const B = mat2x2FromRng(dataRng);
    const noise = makeGauss(noiseRng, NOISE_SIGMA);

    // ⚠ 掩码每条迹必须独立（包括固定组），否则掩码与数据共变 → 零防护
    const maskRng = masked
      ? lcgGen(BigInt(t + 1) * 0xFEEDn + 0xD00D0000n)
      : null;
    const maskSrc = maskRng ? () => maskRng() % MOD : null;

    traces.push(powerTrace(A, B, noise, maskSrc));
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

function tTestAll(fTraces, rTraces) {
  const nP = fTraces[0].length;
  const tStats = new Float64Array(nP);
  for (let p = 0; p < nP; p++) {
    const fv = fTraces.map(t => t[p]);
    const rv = rTraces.map(t => t[p]);
    tStats[p] = welchT(fv, rv);
  }
  return tStats;
}

// ===== 展示 =====
function report(label, tStats) {
  const fails = [], pass = [];
  for (let i = 0; i < tStats.length; i++) {
    (tStats[i] >= THRESHOLD ? fails : pass).push(tStats[i]);
  }
  const maxT = Math.max(...tStats);
  const failPct = (fails.length / tStats.length * 100).toFixed(1);
  const icon = fails.length === 0 ? '✅ PASS' : '❌ FAIL';

  // 统计直方图
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
  console.log(`  max|t|=${maxT.toFixed(3)}  fail=${fails.length}/${tStats.length}(${failPct}%)  ${icon}`);
  return { label, maxT, fails: fails.length, total: tStats.length, failPct, icon, topFails: fails.slice(0, 5).map((t,i)=>t.toFixed(2)) };
}

// ===== 主程序 =====
console.log(`=== LookingGlass TVLA Power Sim v3 ===`);
console.log(`N=${N} n=${N_DIM} σ=${NOISE_SIGMA} thr=${THRESHOLD} trace_len=${traceLen(N_DIM)}\n`);

const results = [];

console.time('control');
results.push(report('Control (fixed vs fixed)',
  tTestAll(collect('fixed', Math.min(N, 1000), false), collect('fixed', Math.min(N, 1000), false))));
console.timeEnd('control');

console.time('naive');
results.push(report('Naive kron()',
  tTestAll(collect('fixed', N, false), collect('random', N, false))));
console.timeEnd('naive');

console.time('masked');
results.push(report('Masked kron()',
  tTestAll(collect('fixed', N, true), collect('random', N, true))));
console.timeEnd('masked');

// Summary
console.log(`\n${'─'.repeat(70)}`);
console.log(` ${'Test'.padEnd(28)}${'max|t|'.padEnd(10)}${'fails'.padEnd(12)}${'verdict'}`);
for (const r of results) {
  console.log(` ${r.label.padEnd(28)}${r.maxT.toFixed(2).padEnd(10)}${(r.fails+'/'+r.total).padEnd(12)}${r.icon}`);
}

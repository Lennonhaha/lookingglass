/**
 * tvla-power-sim.mjs — LookingGlass 张量功耗 TVLA 仿真
 *
 * 建模思路（对标 tensor_tvla.c 的 mat_kron 硬件执行流）：
 *   1. 每条功耗迹 = 操作的时间展开序列，每一步模拟当前数据通路的 Hamming Weight
 *   2. 噪声 = 高斯 (σ_noise)，叠加到信号上
 *   3. 固定密钥组 vs 随机密钥组 → Welch t 检验逐点判定
 *
 * 运行: node tvla-power-sim.mjs [N=5000] [n=8] [noiseSigma=0.5]
 */

import { TensorOps } from '../src/core/tensor-ops.js';

const MOD = 3329n;
TensorOps.MOD = MOD;

// ===== 参数 =====
const N_TRACES = parseInt(process.argv[2] || '5000', 10);  // 每组迹数
const N_DIM    = parseInt(process.argv[3] || '8', 10);     // 矩阵维度
const NOISE_SIGMA = parseFloat(process.argv[4] || '0.5');   // 高斯噪声 σ
const T_STAT_THRESHOLD = 4.5;                               // TVLA 判定阈值

console.log(`=== LookingGlass TVLA Power Trace Simulation ===`);
console.log(`N=${N_TRACES}, n=${N_DIM}, noise_σ=${NOISE_SIGMA}, |t|_threshold=${T_STAT_THRESHOLD}\n`);

// ===== 功耗模型 =====
// Hamming weight: 硬件总线上翻转的 bit 数（CMOS 动态功耗 ∝ HW）
function hw(/** @type {bigint} */ x) {
  let c = 0, v = x < 0n ? -x : x;
  while (v) { c++; v &= v - 1n; }
  return c;
}

// 高斯噪声（Box-Muller）
function gauss(mu = 0, sigma = 1) {
  let u1, u2;
  do { u1 = Math.random(); } while (u1 === 0);
  u2 = Math.random();
  return mu + sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * 模拟一次 kron(A, B) 的功耗迹。
 *
 * 硬件执行流（对应 tensor_tvla.c mat_kron 4 层嵌套循环）：
 *   for i in 0..m
 *     for j in 0..n
 *       a_ij = A[i][j]
 *       for r in 0..p
 *         for c in 0..q
 *           R[idx] = R[idx] + a_ij * B[r][c]
 *
 * 功耗采样点：
 *   外层循环计数器变化  → m×n 个点
 *   内层循环计数器变化  → m×n×p×q 个点（太密就抽样）
 *   乘法器输出 HW       → m×n×p×q 个点
 *   累加器写入 HW        → m×n×p×q 个点
 *
 * 为匹配实际示波器采样率，内层循环每 stride 步合并为一个采样点。
 *
 * @param {Array<Array<bigint>>} A - m×n 矩阵
 * @param {Array<Array<bigint>>} B - p×q 矩阵（固定为 2×2）
 * @returns {number[]} 功耗迹数组
 */
function simulatePowerTrace(A, B) {
  const m = A.length, n = A[0].length;
  const p = B.length, q = B[0].length;
  const trace = [];

  // 原始 4 层循环：m × n × p × q 次乘法
  // 采样压缩：每 STRIDE 次乘法合并为一个 HW 均值点
  const STRIDE = Math.max(1, Math.floor((m * n * p * q) / 500)); // 目标 ~500 点/条
  let accHw = 0, accCount = 0;

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      const a_ij = A[i][j];
      const a_hw = hw(a_ij);
      trace.push(a_hw + gauss(0, NOISE_SIGMA)); // 读 A[i][j] 阶段

      for (let r = 0; r < p; r++) {
        for (let c = 0; c < q; c++) {
          const b_rc = B[r][c];
          const prod = modMul(a_ij, b_rc);
          const prodHw = hw(prod);

          accHw += prodHw + hw(b_rc);
          accCount += 2;

          if (accCount >= STRIDE) {
            trace.push(accHw / accCount + gauss(0, NOISE_SIGMA));
            accHw = 0;
            accCount = 0;
          }
        }
      }
    }
  }

  // 尾数 flush
  if (accCount > 0) {
    trace.push(accHw / accCount + gauss(0, NOISE_SIGMA));
  }

  return trace;
}

function modMul(a, b) { return (a * b) % MOD; }

// ===== 迹采集 =====

/**
 * 生成一组迹（固定或随机密钥）
 * @param {'fixed'|'random'} mode
 * @param {number} nTrials - 迹数
 * @returns {number[][]} trials × timePoints 矩阵
 */
function collectTraces(mode, nTrials) {
  const traces = [];
  const seed = mode === 'fixed' ? 0xCAFE0000n : null;

  for (let t = 0; t < nTrials; t++) {
    // 固定模式：确定性 seed → 相同输入
    // 随机模式：Math.random() → 每次不同
    let A;
    if (mode === 'fixed') {
      A = deterministicMatrix(N_DIM, seed);
    } else {
      A = randomMatrix(N_DIM);
    }
    const B = randomMatrix2x2(mode === 'fixed' ? seed : null);

    const trace = simulatePowerTrace(A, B);
    traces.push(trace);

    if ((t + 1) % Math.floor(nTrials / 10) === 0) {
      process.stdout.write(`  ${mode} ${t + 1}/${nTrials}\r`);
    }
  }
  // 补齐所有迹到相同长度
  const maxLen = Math.max(...traces.map(t => t.length));
  for (const tr of traces) {
    while (tr.length < maxLen) tr.push(0);
  }
  console.log(`  ${mode} ${nTrials}/${nTrials} — done (len=${maxLen})`);
  return traces;
}

// 确定性矩阵生成（基于 seed）
function deterministicMatrix(n, seed) {
  let s = seed ?? 0xCAFE0000n;
  const lcg = () => { s = (s * 1664525n + 1013904223n) & 0xFFFFFFFFn; return s; };
  const A = [];
  for (let i = 0; i < n; i++) {
    A[i] = [];
    for (let j = 0; j < n; j++) {
      A[i][j] = BigInt(Number(lcg()) % Number(MOD));
    }
  }
  return A;
}

function randomMatrix(n) {
  const A = [];
  for (let i = 0; i < n; i++) {
    A[i] = [];
    for (let j = 0; j < n; j++) {
      A[i][j] = BigInt(Math.floor(Math.random() * Number(MOD)));
    }
  }
  return A;
}

function randomMatrix2x2(seed) {
  if (seed != null) {
    let s = seed + 0xDEADn;
    const lcg = () => { s = (s * 1664525n + 1013904223n) & 0xFFFFFFFFn; return s; };
    return [[BigInt(Number(lcg()) % Number(MOD)), BigInt(Number(lcg()) % Number(MOD))],
            [BigInt(Number(lcg()) % Number(MOD)), BigInt(Number(lcg()) % Number(MOD))]];
  }
  return [[BigInt(Math.floor(Math.random() * Number(MOD))), BigInt(Math.floor(Math.random() * Number(MOD)))],
          [BigInt(Math.floor(Math.random() * Number(MOD))), BigInt(Math.floor(Math.random() * Number(MOD)))]];
}

// ===== Welch t-test =====

function welchTAtPoint(fixedValues, randomValues) {
  const n1 = fixedValues.length, n2 = randomValues.length;
  const m1 = fixedValues.reduce((a, b) => a + b, 0) / n1;
  const m2 = randomValues.reduce((a, b) => a + b, 0) / n2;
  const v1 = fixedValues.reduce((a, b) => a + (b - m1) ** 2, 0) / (n1 - 1);
  const v2 = randomValues.reduce((a, b) => a + (b - m2) ** 2, 0) / (n2 - 1);
  const se = Math.sqrt(v1 / n1 + v2 / n2);
  return se === 0 ? 0 : Math.abs((m1 - m2) / se);
}

function tTestAllPoints(fixedTraces, randomTraces) {
  const nPoints = Math.min(fixedTraces[0].length, randomTraces[0].length);
  const tStats = [];
  for (let p = 0; p < nPoints; p++) {
    const fv = fixedTraces.map(t => t[p]);
    const rv = randomTraces.map(t => t[p]);
    tStats.push(welchTAtPoint(fv, rv));
  }
  return tStats;
}

// ===== 可视化（文本） =====

function printTStatHistogram(tStats, threshold) {
  const bins = [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 10, 20, 100, Infinity];
  const counts = new Array(bins.length - 1).fill(0);
  const failCount = [];
  for (let p = 0; p < tStats.length; p++) {
    const t = tStats[p];
    if (t >= threshold) failCount.push({ point: p, t });
    for (let b = 0; b < bins.length - 1; b++) {
      if (t >= bins[b] && t < bins[b + 1]) { counts[b]++; break; }
    }
  }

  console.log('\n=== Welch t-statistic Distribution ===');
  const maxBar = 50;
  const maxCount = Math.max(...counts, 1);
  for (let b = 0; b < bins.length - 1; b++) {
    const range = bins[b + 1] === Infinity ? `≥${bins[b]}` : `[${bins[b]}, ${bins[b + 1]})`;
    const bar = '█'.repeat(Math.round((counts[b] / maxCount) * maxBar));
    const marker = bins[b] >= threshold ? ' ⚠️ FAIL' : '';
    console.log(`  ${range.padEnd(12)} ${counts[b].toString().padStart(5)} ${bar}${marker}`);
  }
  return { failCount, threshold };
}

// ===== 主程序 =====

console.time('total');

console.log('Collecting FIXED-key group...');
const fixedTraces = collectTraces('fixed', N_TRACES);

console.log('Collecting RANDOM-key group...');
const randomTraces = collectTraces('random', N_TRACES);

console.log('\nRunning Welch t-test...');
const tStats = tTestAllPoints(fixedTraces, randomTraces);

const maxT = Math.max(...tStats);
const { failCount } = printTStatHistogram(tStats, T_STAT_THRESHOLD);

// ===== 判定 =====
const passRate = ((tStats.length - failCount.length) / tStats.length * 100).toFixed(1);
const passed = failCount.length === 0;

console.log(`\n=== TVLA Result ===`);
console.log(`  Total time points:  ${tStats.length}`);
console.log(`  max |t|:            ${maxT.toFixed(4)}`);
console.log(`  Threshold:          ${T_STAT_THRESHOLD}`);
console.log(`  Failing points:     ${failCount.length}/${tStats.length} (${(100 - passRate).toFixed(1)}%)`);
console.log(`  Pass rate:          ${passRate}%`);
console.log(`  Verdict:            ${passed ? '✅ PASS' : '❌ FAIL'}`);

if (failCount.length > 0 && failCount.length <= 10) {
  console.log(`\n  Failing detail:`);
  for (const f of failCount) {
    console.log(`    point ${f.point}: |t|=${f.t.toFixed(3)}`);
  }
}

// 附加校验：控制组（全部固定）
console.log(`\n=== Control Group (fixed vs fixed) ===`);
const controlTraces = collectTraces('fixed', Math.min(N_TRACES, 1000));
const cStats = tTestAllPoints(fixedTraces.slice(0, 1000), controlTraces);
const cMaxT = Math.max(...cStats);
const cFail = cStats.filter(t => t >= T_STAT_THRESHOLD).length;
console.log(`  max |t|: ${cMaxT.toFixed(4)} | failing: ${cFail}/${cStats.length}`);
console.log(`  Verdict: ${cMaxT < T_STAT_THRESHOLD ? '✅ PASS (no false positive)' : '⚠️ FALSE POSITIVE detected'}`);

console.timeEnd('total');

// ===== 输出 JSON =====
const report = {
  timestamp: new Date().toISOString(),
  methodology: 'Simulated power trace (Hamming Weight model) → Welch t-test',
  parameters: { N: N_TRACES, n: N_DIM, noiseSigma: NOISE_SIGMA, threshold: T_STAT_THRESHOLD },
  results: {
    tvla: {
      maxAbsT: maxT,
      failingPoints: failCount.length,
      totalPoints: tStats.length,
      passRatePercent: parseFloat(passRate),
      passed,
    },
    control: {
      maxAbsT: cMaxT,
      failingPoints: cFail,
      passed: cMaxT < T_STAT_THRESHOLD,
    },
    tStatDetail: failCount.slice(0, 20), // first 20 failing points
  },
  verdict: passed ? 'PASS' : 'FAIL',
};
console.log('\n' + JSON.stringify(report, null, 2));

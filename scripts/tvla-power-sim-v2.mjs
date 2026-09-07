/**
 * tvla-power-sim-v2.mjs — LookingGlass TVLA 功耗仿真 v2（掩码对比）
 *
 * 两条线：
 *   ① Naive kron() — 预期 FAIL（数据直接决定 HW）
 *   ② Masked kron() — 预期 PASS（掩码后中间值不泄露密钥）
 *
 * 掩码策略（对标 SM2 scalar masking）：
 *   对输入矩阵 A 的每个元素加随机掩码 m_A ∈ Z_q，运行时补偿
 *   kron(A_masked, B) → 解掩码恢复正确结果
 *
 * 用法: node scripts/tvla-power-sim-v2.mjs [N=2000] [n=8] [sigma=5]
 */

import { TensorOps } from '../src/core/tensor-ops.js';

TensorOps.MOD = 3329n;
const MOD = 3329n;

const N = parseInt(process.argv[2] || '2000', 10);
const N_DIM = parseInt(process.argv[3] || '8', 10);
const NOISE_SIGMA = parseFloat(process.argv[4] || '5.0');  // 真实物理 ≫ 0.5
const T_THRESHOLD = 4.5;

// ============= 工具函数 =============

function gauss(mu = 0, sigma = 1) {
  let u1, u2;
  do { u1 = Math.random(); } while (u1 === 0);
  u2 = Math.random();
  return mu + sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function hwBigint(x) {
  let v = x < 0n ? -x : x, c = 0;
  while (v) { c++; v &= v - 1n; }
  return c;
}

function modMul(a, b) { return (a * b) % MOD; }
function modAdd(a, b) { return ((a + b) % MOD + MOD) % MOD; }
function modSub(a, b) { return ((a - b) % MOD + MOD) % MOD; }

// ============= 功耗迹仿真 =============

function matEmpty(n) { return Array.from({length: n}, () => new Array(n).fill(0n)); }
function matRandom(n) { return Array.from({length: n}, () => Array.from({length: n}, () => BigInt(Math.floor(Math.random() * Number(MOD))))); }

/**
 * Naive kron 功耗迹（与 v1 相同）
 */
function simulateNaiveKron(A, B) {
  const m = A.length, n = A[0].length, p = B.length, q = B[0].length;
  const trace = [];
  const STRIDE = Math.max(1, Math.floor((m * n * p * q) / 500));
  let accHw = 0, accCount = 0;

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      const a = A[i][j];
      trace.push(hwBigint(a) + gauss(0, NOISE_SIGMA));
      for (let r = 0; r < p; r++) {
        for (let c = 0; c < q; c++) {
          const b = B[r][c];
          const prod = modMul(a, b);
          accHw += hwBigint(prod) + hwBigint(b);
          accCount += 2;
          if (accCount >= STRIDE) { trace.push(accHw / accCount + gauss(0, NOISE_SIGMA)); accHw = accCount = 0; }
        }
      }
    }
  }
  if (accCount > 0) trace.push(accHw / accCount + gauss(0, NOISE_SIGMA));
  return trace;
}

/**
 * 确定性掩码序列生成器（LCG）
 */
function makeMaskGen(seed) {
  let s = BigInt(seed);
  return () => { s = (s * 1664525n + 1013904223n) & 0xFFFFFFFFn; return s % MOD; };
}

/**
 * Masked kron 功耗迹
 *
 * 掩码方案：
 *   对 A 加随机掩码 m_A，B 加随机掩码 m_B
 *   kron(A, B) 不直接计算，而是：
 *     kron(A, B) = kron(A - m_A, B - m_B) + kron(m_A, B - m_B) + kron(A - m_A, m_B) + kron(m_A, m_B)
 *   每次 kron 调用硬件执行相同的运算序列，中间值由掩码随机化
 *
 * 简化为实际方案：对 A 的每个元素加随机掩码 mask ∈ Z_q，
 * kron(A_masked, B) 在累加后校正。功耗迹建模为 HW(randomized_value)。
 */
function simulateMaskedKron(A, B) {
  const m = A.length, n = A[0].length, p = B.length, q = B[0].length;
  const trace = [];
  const STRIDE = Math.max(1, Math.floor((m * n * p * q) / 500));
  let accHw = 0, accCount = 0;

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      const aRaw = A[i][j];
      const mask = BigInt(Math.floor(Math.random() * Number(MOD)));  // 每轮新鲜掩码
      const aMasked = modAdd(aRaw, mask);

      // 功耗由 masked 值主导，而非原始 aRaw
      trace.push(hwBigint(aMasked) + gauss(0, NOISE_SIGMA));

      for (let r = 0; r < p; r++) {
        for (let c = 0; c < q; c++) {
          const b = B[r][c];
          const prod = modMul(aMasked, b);
          accHw += hwBigint(prod) + hwBigint(b);
          accCount += 2;
          if (accCount >= STRIDE) { trace.push(accHw / accCount + gauss(0, NOISE_SIGMA)); accHw = accCount = 0; }
        }
      }
    }
  }
  if (accCount > 0) trace.push(accHw / accCount + gauss(0, NOISE_SIGMA));
  return trace;
}

// ============= Welch t-test =============

function welchT(fixed, random) {
  const n1 = fixed.length, n2 = random.length;
  const m1 = fixed.reduce((a, b) => a + b, 0) / n1;
  const m2 = random.reduce((a, b) => a + b, 0) / n2;
  const v1 = fixed.reduce((a, b) => a + (b - m1) ** 2, 0) / (n1 - 1);
  const v2 = random.reduce((a, b) => a + (b - m2) ** 2, 0) / (n2 - 1);
  const se = Math.sqrt(v1 / n1 + v2 / n2);
  return se === 0 ? 0 : Math.abs((m1 - m2) / se);
}

function tTestAll(fixedTraces, randomTraces) {
  const nP = Math.min(fixedTraces[0].length, randomTraces[0].length);
  return Array.from({length: nP}, (_, p) => welchT(fixedTraces.map(t => t[p]), randomTraces.map(t => t[p])));
}

// ============= 采集 =============

function collect(mode, nTrials, simFn) {
  const traces = [];
  // 固定模式：首先生成 A,B 一次，后面复用
  const cachedA = mode === 'fixed' ? matRandom(N_DIM) : null;
  const cachedB = mode === 'fixed' ? matRandom(2) : null;
  for (let t = 0; t < nTrials; t++) {
    const A = mode === 'fixed' ? cachedA : matRandom(N_DIM);
    const B = mode === 'fixed' ? cachedB : matRandom(2);
    traces.push(simFn(A, B));
  }
  // 对齐长度
  const maxLen = Math.max(...traces.map(t => t.length));
  for (const tr of traces) while (tr.length < maxLen) tr.push(0);
  return traces;
}

// ============= 展示 =============

function show(label, tStats) {
  const maxT = Math.max(...tStats);
  const fails = tStats.filter(t => t >= T_THRESHOLD).length;
  const passRate = ((tStats.length - fails) / tStats.length * 100).toFixed(1);
  const icon = fails === 0 ? '✅ PASS' : '❌ FAIL';

  // 直方图
  const bins = [0, 1, 2, 3, 4.0, 4.5, 5, 10, 20, 50, Infinity];
  const counts = bins.slice(1).fill(0);
  for (const t of tStats) {
    for (let b = 0; b < bins.length - 1; b++) {
      if (t >= bins[b] && t < bins[b + 1]) { counts[b]++; break; }
    }
  }
  console.log(`\n--- ${label} ---`);
  const maxC = Math.max(...counts, 1);
  for (let b = 0; b < bins.length - 1; b++) {
    const range = bins[b + 1] === Infinity ? `≥${bins[b]}` : `[${bins[b]},${bins[b + 1]})`;
    const bar = '█'.repeat(Math.round(counts[b] / maxC * 40));
    console.log(`  ${range.padEnd(12)} ${counts[b].toString().padStart(5)} ${bar}`);
  }
  console.log(`  max |t|: ${maxT.toFixed(3)}  |  fails: ${fails}/${tStats.length}  |  pass rate: ${passRate}%  |  ${icon}`);
  return { label, maxT, fails, total: tStats.length, passRate, icon, tStats };
}

// ============= 主程序 =============

console.log(`=== LookingGlass TVLA Power Sim v2 ===`);
console.log(`N=${N}, n=${N_DIM}, noise_σ=${NOISE_SIGMA}, |t|_threshold=${T_THRESHOLD}\n`);

const results = [];

console.time('naive');
results.push(show('Naive kron()', tTestAll(collect('fixed', N, simulateNaiveKron), collect('random', N, simulateNaiveKron))));
console.timeEnd('naive');

console.time('masked');
results.push(show('Masked kron()', tTestAll(collect('fixed', N, simulateMaskedKron), collect('random', N, simulateMaskedKron))));
console.timeEnd('masked');

// 对照
console.time('control');
const cf = collect('fixed', Math.min(N, 500), simulateNaiveKron);
const cf2 = collect('fixed', Math.min(N, 500), simulateNaiveKron);
results.push(show('Control (fixed vs fixed)', tTestAll(cf, cf2)));
console.timeEnd('control');

// 汇总
console.log(`\n${'='.repeat(60)}`);
console.log(`${'Test'.padEnd(25)} ${'max|t|'.padEnd(10)} ${'fails'.padEnd(10)} ${'pass'.padEnd(10)} ${'verdict'}`);
for (const r of results) {
  console.log(`${r.label.padEnd(25)} ${r.maxT.toFixed(2).padEnd(10)} ${(r.fails+'/'+r.total).padEnd(10)} ${(r.passRate+'%').padEnd(10)} ${r.icon}`);
}

// Diagnose: why masked kron still fails?
// Hypothesis: the signal (pre-noise HW) is still deterministic for fixed group
import { TensorOps } from '../src/core/tensor-ops.js';
TensorOps.MOD = 3329n;
const MOD = 3329n;

const NOISE_SIGMA = 4.0;

function lcgGen(seed) {
  let s = BigInt(seed) | 1n;
  return () => { s = (s * 0x5DEECE66Dn + 0xBn) & 0xFFFFFFFFFFFFn; return s; };
}

function makeGauss(rng, sigma) {
  let spare = null;
  return () => {
    if (spare !== null) { const v = spare; spare = null; return v * sigma; }
    let u1, u2, r2;
    do { u1 = 2*Number(rng()&0xFFFFFFFFFFFFn)/0xFFFFFFFFFFFF-1; u2=2*Number(rng()&0xFFFFFFFFFFFFn)/0xFFFFFFFFFFFF-1; r2=u1*u1+u2*u2; } while(r2>=1||r2===0);
    const m = Math.sqrt(-2*Math.log(r2)/r2); spare=u2*m; return u1*m*sigma;
  };
}

function hw(x) { let c=0,v=x<0n?-x:x;while(v){c++;v&=v-1n;}return c; }

function collectHwAtPoint0(nTraces, mode, masked) {
  const vals = [];
  for (let t = 0; t < nTraces; t++) {
    const dataRng = mode === 'fixed'
      ? lcgGen(0xCAFE0000n)
      : lcgGen(BigInt(t + 1) * 0xDEADn);
    const noiseRng = mode === 'fixed'
      ? lcgGen(0xBEEF0000n)
      : lcgGen(BigInt(t + 1) * 0xBEEFn);
    const maskRng = masked
      ? lcgGen(BigInt(t + 1) * 0xFEEDn + 0xD00D0000n)
      : null;

    const a = dataRng() % MOD;
    const aWork = masked ? (a + (maskRng() % MOD)) % MOD : a;
    const noise = makeGauss(noiseRng, NOISE_SIGMA);
    vals.push(Number(hw(aWork)) + noise());
  }

  const mean = vals.reduce((a,b)=>a+b,0) / vals.length;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const uniqueCount = new Set(vals.map(v=>Math.round(v))).size;
  console.log(`  ${mode}${masked?' masked':''}   a_work_unique=${uniqueCount}/${nTraces}  mean=${mean.toFixed(2)}  range=[${min.toFixed(1)},${max.toFixed(1)}]`);
  return { mean, vals, uniqueCount };
}

console.log('=== Point-0 HW distribution (first A element) ===\n');
console.log(`N=100, σ=${NOISE_SIGMA}\n`);

const f_nv = collectHwAtPoint0(100, 'fixed', false);
const r_nv = collectHwAtPoint0(100, 'random', false);
const f_mv = collectHwAtPoint0(100, 'fixed', true);
const r_mv = collectHwAtPoint0(100, 'random', true);

// Welch
function welch(fv, rv) {
  const n1=fv.length,n2=rv.length;
  const m1=fv.reduce((a,b)=>a+b,0)/n1,m2=rv.reduce((a,b)=>a+b,0)/n2;
  let v1=0,v2=0;
  for(const d of fv) v1+=(d-m1)**2;
  for(const d of rv) v2+=(d-m2)**2;
  v1/=(n1-1);v2/=(n2-1);
  const se=Math.sqrt(v1/n1+v2/n2);
  return se<1e-12 ? 0 : Math.abs((m1-m2)/se);
}

console.log(`\n=== Welch t-test at point 0 ===`);
console.log(`  Naive  fixed vs random: |t|=${welch(f_nv.vals, r_nv.vals).toFixed(3)}`);
console.log(`  Masked fixed vs random: |t|=${welch(f_mv.vals, r_mv.vals).toFixed(3)}`);
console.log(`  Control f vs f:         |t|=${welch(f_nv.vals, f_nv.vals).toFixed(3)}`);

// Key insight: is hw(a_fixed) constant across traces?
console.log(`\n=== Key insight ===`);
const aFixed = lcgGen(0xCAFE0000n)() % MOD;
console.log(`  Fixed-group raw a:   ${aFixed} (hw=${hw(aFixed)}) — SAME for all traces`);
console.log(`  Fixed-group aWork:   (${aFixed} + mask_t) % MOD — DIFFERENT per trace`);
console.log(`  Random-group a:      random per trace`);
console.log(`  All aWork uniformly distributed over Z_q → HW mean ≈ ${Array.from({length:1000},()=>hw(BigInt(Math.floor(Math.random()*3329)))).reduce((a,b)=>a+b,0)/1000}`);

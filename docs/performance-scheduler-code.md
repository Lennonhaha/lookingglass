# LookingGlass 性能调度器 — 代码实现

> 完整代码：多后端自动检测与智能调度（JS原始 / JS优化 / WASM / C++ Addon）

## 核心代码

### `src/performance-scheduler.js`

```javascript
/**
 * LookingGlass: 自动性能检测与调度器
 * 优先级: C++ Addon > WASM > JS优化 > JS原始
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// 1. 性能检测工具
// ============================================================

class PerformanceDetector {
  constructor() {
    this.results = {
      jsOriginal: null,
      jsOptimized: null,
      wasm: null,
      cpp: null
    };
    this.bestImplementation = null;
  }

  async detect(iterations = 100, warmup = 10) {
    console.log('🔬 LookingGlass 性能检测器');
    console.log('=====================================\n');

    const testA = this.generateTestMatrix(16);
    const testB = this.generateTestMatrix(16);

    // 1. JS原始
    console.log('📦 检测 JS 原始实现...');
    try {
      const { TensorOps } = require('../src/core/tensor-ops');
      const time = this.benchmark(() => TensorOps.kron(testA, testB), iterations, warmup);
      this.results.jsOriginal = time;
      console.log(`   ✅ JS原始: ${time.toFixed(2)}ms/op`);
    } catch (e) {
      this.results.jsOriginal = Infinity;
    }

    // 2. JS优化
    console.log('📦 检测 JS 优化实现...');
    try {
      const { TensorOpsOptimized } = require('../src/core/tensor-ops-optimized');
      const time = this.benchmark(() => TensorOpsOptimized.kron(testA, testB), iterations, warmup);
      this.results.jsOptimized = time;
      console.log(`   ✅ JS优化: ${time.toFixed(2)}ms/op`);
    } catch (e) {
      this.results.jsOptimized = Infinity;
    }

    // 3. WASM
    console.log('📦 检测 WASM 实现...');
    try {
      const wasmTime = await this.testWasm(testA, testB, iterations, warmup);
      this.results.wasm = wasmTime ?? Infinity;
      if (wasmTime) console.log(`   ✅ WASM: ${wasmTime.toFixed(2)}ms/op`);
    } catch (e) {
      this.results.wasm = Infinity;
    }

    // 4. C++ Addon
    console.log('📦 检测 C++ Addon...');
    try {
      const cppTime = await this.testCpp(testA, testB, iterations, warmup);
      this.results.cpp = cppTime ?? Infinity;
      if (cppTime) console.log(`   ✅ C++: ${cppTime.toFixed(2)}ms/op`);
    } catch (e) {
      this.results.cpp = Infinity;
    }

    this.selectBest();
    this.printReport();
    return this.results;
  }

  benchmark(fn, iterations, warmup) {
    for (let i = 0; i < warmup; i++) fn();
    const start = performance.now();
    for (let i = 0; i < iterations; i++) fn();
    return (performance.now() - start) / iterations;
  }

  async testWasm(A, B, iterations, warmup) {
    try {
      const wasmPath = path.join(__dirname, '../wasm/pkg/lookingglass_wasm.js');
      if (!fs.existsSync(wasmPath)) return null;
      const wasmModule = await import(wasmPath);
      const { TensorOpsWasm } = wasmModule;
      const ops = new TensorOpsWasm(3329);
      const aJson = JSON.parse(JSON.stringify(A));
      const bJson = JSON.parse(JSON.stringify(B));
      return this.benchmark(() => ops.kron(aJson, bJson), iterations, warmup);
    } catch { return null; }
  }

  async testCpp(A, B, iterations, warmup) {
    try {
      const addonPath = path.join(__dirname, '../native/build/Release/tensor_ops.node');
      if (!fs.existsSync(addonPath)) return null;
      const addon = require(addonPath);
      const ops = new addon.TensorOps(3329);
      return this.benchmark(() => ops.kron(A, B), iterations, warmup);
    } catch { return null; }
  }

  selectBest() {
    const candidates = [
      { name: 'C++ Addon', time: this.results.cpp },
      { name: 'WASM',      time: this.results.wasm },
      { name: 'JS优化',     time: this.results.jsOptimized },
      { name: 'JS原始',     time: this.results.jsOriginal }
    ];
    const available = candidates.filter(c => c.time !== null && c.time !== Infinity);
    if (available.length === 0) { this.bestImplementation = null; return; }
    available.sort((a, b) => a.time - b.time);
    this.bestImplementation = available[0];
  }

  printReport() {
    console.log('\n=====================================');
    console.log('📊 检测报告');
    console.log('=====================================');
    const impls = [
      { name: 'JS原始',     time: this.results.jsOriginal },
      { name: 'JS优化',     time: this.results.jsOptimized },
      { name: 'WASM',      time: this.results.wasm },
      { name: 'C++ Addon', time: this.results.cpp }
    ];
    const maxTime = Math.max(...impls.filter(c => c.time !== null && c.time !== Infinity).map(c => c.time));
    for (const impl of impls) {
      if (impl.time === null || impl.time === Infinity) {
        console.log(`  ${impl.name.padEnd(12)}: ❌ 不可用`);
        continue;
      }
      const isBest = this.bestImplementation?.name === impl.name;
      console.log(`  ${impl.name.padEnd(12)}: ${impl.time.toFixed(2)}ms/op${isBest ? ' 🏆' : ''}`);
    }
    if (this.bestImplementation) {
      console.log(`\n🏆 推荐实现: ${this.bestImplementation.name}`);
      console.log(`   (${(this.results.jsOriginal / this.bestImplementation.time).toFixed(1)}x 加速)`);
    }
    console.log('=====================================\n');
  }

  generateTestMatrix(n) {
    return Array.from({ length: n }, () =>
      Array.from({ length: n }, () => BigInt(Math.floor(Math.random() * 3329)))
    );
  }
}

// ============================================================
// 2. 智能调度器
// ============================================================

class LookingGlassScheduler {
  constructor() {
    this.detector = new PerformanceDetector();
    this.impl = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    await this.detector.detect(50, 5);
    this.impl = this.detector.bestImplementation;
    this.initialized = true;
    console.log(`✅ LookingGlass 调度器已初始化，使用: ${this.impl?.name || '无可用实现'}`);
  }

  getBest() { return this.impl; }

  kron(A, B) {
    if (!this.initialized) throw new Error('调度器未初始化，请先调用 init()');
    const name = this.impl?.name;
    try {
      switch (name) {
        case 'C++ Addon': {
          const addon = require('../native/build/Release/tensor_ops.node');
          const ops = new addon.TensorOps(3329);
          return ops.kron(A, B);
        }
        case 'WASM': {
          const wasmModule = require('../wasm/pkg/lookingglass_wasm.js');
          const ops = new wasmModule.TensorOpsWasm(3329);
          return ops.kron(A, B);
        }
        case 'JS优化': {
          const { TensorOpsOptimized } = require('../src/core/tensor-ops-optimized');
          return TensorOpsOptimized.kron(A, B);
        }
        default: {
          const { TensorOps } = require('../src/core/tensor-ops');
          return TensorOps.kron(A, B);
        }
      }
    } catch { return this.fallbackKron(A, B); }
  }

  fallbackKron(A, B) {
    const { TensorOps } = require('../src/core/tensor-ops');
    return TensorOps.kron(A, B);
  }

  getReport() { return this.detector.results; }

  switchTo(implName) {
    const map = { cpp: 'C++ Addon', wasm: 'WASM', jsOptimized: 'JS优化', jsOriginal: 'JS原始' };
    if (!map[implName]) throw new Error(`不支持实现: ${implName}`);
    this.impl = { name: map[implName], time: 0 };
    console.log(`🔄 已切换到: ${map[implName]}`);
  }
}

// ============================================================
// 3. 单例导出
// ============================================================

let instance = null;
function getScheduler() {
  if (!instance) instance = new LookingGlassScheduler();
  return instance;
}

module.exports = { PerformanceDetector, LookingGlassScheduler, getScheduler };
```

## 使用示例

```javascript
const { getScheduler } = require('./performance-scheduler');

async function main() {
  const scheduler = getScheduler();
  await scheduler.init();

  const A = [[1n, 2n], [3n, 4n]];
  const B = [[5n, 6n], [7n, 8n]];
  const result = scheduler.kron(A, B);
  console.log('结果:', result);
}
```

## 关联文档

| 文档 | 说明 |
|------|------|
| docs/performance-scheduler.md | 功能说明与使用指南 |
| docs/lookingglass-spec.md | LookingGlass 技术说明 |

/**
 * LookingGlass: Infinite Mirror Tests
 */

const { InfiniteMirror } = require('../src/core/infinite-mirror');
const { TensorOps } = require('../src/core/tensor-ops');

describe('InfiniteMirror', () => {
  beforeAll(() => { TensorOps.MOD = 3329n; });

  describe('初始化', () => {
    test('创建指定层数', () => {
      const m = new InfiniteMirror({ depth: 4, n: 32, q: 3329n, sigma: 1.0 });
      expect(m.depth).toBe(4);
      expect(m.layers.length).toBe(4);
    });

    test('每层维度递增', () => {
      const m = new InfiniteMirror({ depth: 3, n: 16, q: 3329n, sigma: 1.0 });
      for (let i = 0; i < 3; i++)
        expect(m.layers[i].n).toBe(16 * (i + 1));
    });
  });

  describe('多层陷门', () => {
    test('生成多层', () => {
      const m = new InfiniteMirror({ depth: 3, n: 16, q: 3329n, sigma: 1.0 });
      const t = m.generateMultiLayerTrapdoor(TensorOps.randomTensor([32, 16], 3329n));
      expect(t.trapdoorStack.length).toBe(3);
      expect(t.finalA).toBeDefined();
    });

    test('每层有视角', () => {
      const m = new InfiniteMirror({ depth: 2, n: 16, q: 3329n, sigma: 1.0 });
      const t = m.generateMultiLayerTrapdoor(TensorOps.randomTensor([32, 16], 3329n));
      t.trapdoorStack.forEach(l => {
        expect(l.view).toBeDefined();
        expect(l.s).toBeDefined();
      });
    });
  });

  describe('复杂度', () => {
    test('随深度增长', () => {
      const c1 = new InfiniteMirror({ depth: 1, n: 16, q: 3329n, sigma: 1.0 }).getAttackComplexity();
      const c2 = new InfiniteMirror({ depth: 3, n: 16, q: 3329n, sigma: 1.0 }).getAttackComplexity();
      expect(c2.log2Complexity).toBeGreaterThan(c1.log2Complexity);
    });

    test('报告含推荐', () => {
      const r = new InfiniteMirror({ depth: 3, n: 32, q: 3329n, sigma: 1.0 }).generateSecurityReport();
      expect(r.securityLevel).toBeDefined();
    });
  });

  describe('解密', () => {
    test('解密保持维度一致', () => {
      const n = 8;
      const m = new InfiniteMirror({ depth: 2, n, q: 3329n, sigma: 1.0 });
      const t = m.generateMultiLayerTrapdoor(TensorOps.randomTensor([16, n], 3329n));
      const cols = t.finalA[0].length;
      const rows = t.finalA.length;
      const msg = Array.from({ length: rows }, () => BigInt(Math.floor(Math.random() * 3329)));
      const ct = TensorOps.matMul([msg], t.finalA)[0];
      const dec = m.decryptWithTrapdoor(t, ct);
      expect(dec.length).toBe(cols);
      expect(ct.length).toBe(cols);
    });
  });
});

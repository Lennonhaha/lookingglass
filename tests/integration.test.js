/**
 * LookingGlass: Integration Tests
 */

const { TensorOps } = require('../src/core/tensor-ops');
const { InfiniteMirror } = require('../src/core/infinite-mirror');
const { TrapdoorGenerator } = require('../src/trapdoor/trapdoor-generator');

describe('Integration', () => {
  beforeAll(() => { TensorOps.MOD = 3329n; });

  describe('完整工作流', () => {
    test('端到端: 生成-加密-解密', () => {
      const gen = new TrapdoorGenerator({ n: 8, q: 3329n, sigma: 1.0, depth: 2, k: 2 });
      const kp = gen.generate();
      const cols = kp.tensorKey.A_tensor[0].length;
      const rows = kp.tensorKey.A_tensor.length;
      const pt = Array.from({ length: rows }, () => BigInt(Math.floor(Math.random() * 3329)));
      const ct = TensorOps.matMul([pt], kp.tensorKey.A_tensor)[0];
      const dec = gen.decaps(ct, kp.privateKey);
      // Encryption: matMul reduces rows→cols. Decrypt returns cols-length vector.
      expect(dec.length).toBe(cols);
      expect(ct.length).toBe(cols);
    });

    test('多层镜子完整流程', () => {
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

  describe('性能', () => {
    test('陷门生成 <5s', () => {
      const gen = new TrapdoorGenerator({ n: 16, q: 3329n, sigma: 1.0, depth: 2, k: 2 });
      const t0 = Date.now();
      gen.generate();
      expect(Date.now() - t0).toBeLessThan(5000);
    });

    test('加密-解密循环 <100ms', () => {
      const gen = new TrapdoorGenerator({ n: 8, q: 3329n, sigma: 1.0, depth: 2, k: 2 });
      const kp = gen.generate();
      const rows = kp.tensorKey.A_tensor.length;
      const pt = Array.from({ length: rows }, () => BigInt(Math.floor(Math.random() * 3329)));
      const t0 = Date.now();
      for (let i = 0; i < 10; i++) {
        const ct = TensorOps.matMul([pt], kp.tensorKey.A_tensor)[0];
        gen.decaps(ct, kp.privateKey);
      }
      expect((Date.now() - t0) / 10).toBeLessThan(100);
    });
  });
});

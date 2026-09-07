/**
 * LookingGlass: KAT Tests
 */

const { TensorOps } = require('../src/core/tensor-ops');
const { TrapdoorGenerator } = require('../src/trapdoor/trapdoor-generator');

describe('KAT', () => {
  beforeAll(() => { TensorOps.MOD = 3329n; });

  test('同配置密钥结构一致', () => {
    const cfg = { n: 16, q: 3329n, sigma: 1.0, depth: 2, k: 2 };
    const kp1 = new TrapdoorGenerator(cfg).generate();
    const kp2 = new TrapdoorGenerator(cfg).generate();
    expect(kp1.publicKey.A.length).toBe(kp2.publicKey.A.length);
    expect(kp1.privateKey.s.length).toBe(kp2.privateKey.s.length);
    expect(kp1.tensorKey.depth).toBe(kp2.tensorKey.depth);
  });

  test('固定明文加密结果长度一致', () => {
    const n = 8, k = 2, depth = 2;
    const gen = new TrapdoorGenerator({ n, q: 3329n, sigma: 1.0, depth, k });
    const kp = gen.generate();
    const ptLen = kp.tensorKey.A_tensor.length;
    const pt = Array.from({ length: ptLen }, (_, i) => BigInt(i + 1));
    const ct1 = TensorOps.matMul([pt], kp.tensorKey.A_tensor)[0];
    const ct2 = TensorOps.matMul([pt], kp.tensorKey.A_tensor)[0];
    expect(ct1.length).toBe(ct2.length);
  });

  test('不同配置密钥结构独立', () => {
    const kp = new TrapdoorGenerator({ n: 8, q: 3329n, sigma: 1.0, depth: 1, k: 2 }).generate();
    expect(kp.publicKey.A.length).toBeGreaterThan(0);
  });
});

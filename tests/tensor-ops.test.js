/**
 * LookingGlass: 张量运算单元测试
 * 验证 TensorOps 核心运算的正确性
 */

const { TensorOps } = require('../src/core/tensor-ops');

describe('TensorOps', () => {
  beforeAll(() => {
    TensorOps.MOD = 3329n;
  });

  describe('张量积 (Kronecker Product)', () => {
    test('2x2 矩阵与 2x2 矩阵的张量积', () => {
      const A = [[1n, 2n], [3n, 4n]];
      const B = [[5n, 6n], [7n, 8n]];
      const result = TensorOps.kron(A, B);

      expect(result.length).toBe(4);
      expect(result[0].length).toBe(4);
      expect(result[0][0]).toBe(5n);
      expect(result[0][1]).toBe(6n);
      expect(result[0][2]).toBe(10n);
      expect(result[0][3]).toBe(12n);
    });

    test('单位矩阵与任意矩阵的张量积等于对角块矩阵', () => {
      const I = TensorOps.identity(2);
      const A = [[1n, 2n], [3n, 4n]];
      const result = TensorOps.kron(I, A);

      expect(result[0][0]).toBe(1n);
      expect(result[0][1]).toBe(2n);
      expect(result[0][2]).toBe(0n);
      expect(result[0][3]).toBe(0n);
      expect(result[2][0]).toBe(0n);
      expect(result[2][1]).toBe(0n);
      expect(result[2][2]).toBe(1n);
      expect(result[2][3]).toBe(2n);
    });

    test('张量积与标量乘法的一致性: (cA)⊗B = A⊗(cB)', () => {
      const A = [[1n, 2n], [3n, 4n]];
      const B = [[5n, 6n], [7n, 8n]];
      const c = 3n;

      const cA = A.map(row => row.map(v => (v * c) % TensorOps.MOD));
      const result1 = TensorOps.kron(cA, B);

      const cB = B.map(row => row.map(v => (v * c) % TensorOps.MOD));
      const result2 = TensorOps.kron(A, cB);

      expect(result1).toEqual(result2);
    });
  });

  describe('张量加法和减法', () => {
    test('张量加法：A + B = B + A（交换律）', () => {
      const A = [[1n, 2n], [3n, 4n]];
      const B = [[5n, 6n], [7n, 8n]];
      expect(TensorOps.tensorAdd(A, B)).toEqual(TensorOps.tensorAdd(B, A));
    });

    test('张量减法：A - A = 0', () => {
      const A = [[1n, 2n], [3n, 4n]];
      const result = TensorOps.tensorSub(A, A);
      expect(result[0][0]).toBe(0n);
      expect(result[0][1]).toBe(0n);
      expect(result[1][0]).toBe(0n);
      expect(result[1][1]).toBe(0n);
    });
  });

  describe('矩阵乘法', () => {
    test('2x2 矩阵乘法', () => {
      const A = [[1n, 2n], [3n, 4n]];
      const B = [[5n, 6n], [7n, 8n]];
      const result = TensorOps.matMul(A, B);

      expect(result[0][0]).toBe(19n);
      expect(result[0][1]).toBe(22n);
      expect(result[1][0]).toBe(43n);
      expect(result[1][1]).toBe(50n);
    });

    test('矩阵乘法的结合律: A(BC) = (AB)C', () => {
      const A = [[1n, 2n], [3n, 4n]];
      const B = [[5n, 6n], [7n, 8n]];
      const C = [[9n, 10n], [11n, 12n]];

      const left = TensorOps.matMul(A, TensorOps.matMul(B, C));
      const right = TensorOps.matMul(TensorOps.matMul(A, B), C);
      expect(left).toEqual(right);
    });

    test('转置关系: (AB)^T = B^T A^T', () => {
      const A = [[1n, 2n], [3n, 4n]];
      const B = [[5n, 6n], [7n, 8n]];

      const AB_T = TensorOps.transpose(TensorOps.matMul(A, B));
      const BT_AT = TensorOps.matMul(TensorOps.transpose(B), TensorOps.transpose(A));
      expect(AB_T).toEqual(BT_AT);
    });
  });

  describe('随机张量生成', () => {
    test('生成指定尺寸的随机张量', () => {
      const shape = [3, 4];
      const result = TensorOps.randomTensor(shape, 3329n);
      expect(result.length).toBe(3);
      expect(result[0].length).toBe(4);
      expect(result.every(row => row.every(v => v >= 0n && v < 3329n))).toBe(true);
    });

    test('两次生成的结果不同（随机性）', () => {
      const shape = [2, 2];
      const result1 = TensorOps.randomTensor(shape, 3329n);
      const result2 = TensorOps.randomTensor(shape, 3329n);
      // BigInt can't be JSON.stringify'd, compare element-by-element
      const same = result1.every((row, i) => row.every((v, j) => v === result2[i][j]));
      expect(same).toBe(false);
    });
  });

  describe('单位矩阵', () => {
    test('生成 n×n 单位矩阵', () => {
      const n = 4;
      const I = TensorOps.identity(n);

      expect(I.length).toBe(n);
      expect(I[0].length).toBe(n);

      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i === j) {
            expect(I[i][j]).toBe(1n);
          } else {
            expect(I[i][j]).toBe(0n);
          }
        }
      }
    });

    test('单位矩阵与任意矩阵相乘不变: I·A = A', () => {
      const I = TensorOps.identity(2);
      const A = [[1n, 2n], [3n, 4n]];
      expect(TensorOps.matMul(I, A)).toEqual(A);
    });
  });
});

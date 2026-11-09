const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync('Code.gs', 'utf8');
const context = { console };
vm.createContext(context);
vm.runInContext(source, context);

const now = new Date(2026, 10, 9, 12, 0, 0);

function test(input, expected) {
  const result = context.parseTransaction_(input, now);
  assert.strictEqual(result.ok, true, input);
  Object.keys(expected).forEach((key) => assert.deepStrictEqual(result[key], expected[key], input + ' [' + key + ']'));
}

test('makan siang 25rb tunai', {
  amount: 25000,
  type: 'Pengeluaran',
  category: 'Makan & Minum',
  paymentMethod: 'Tunai'
});

test('masuk 5jt gaji transfer', {
  amount: 5000000,
  type: 'Pemasukan',
  category: 'Gaji',
  paymentMethod: 'Transfer Bank'
});

test('kemarin bensin 100rb gopay', {
  amount: 100000,
  type: 'Pengeluaran',
  category: 'Transportasi',
  paymentMethod: 'GoPay'
});

const dated = context.parseTransaction_('5 november bayar listrik 450rb', now);
assert.strictEqual(dated.ok, true);
assert.strictEqual(dated.date.getFullYear(), 2026);
assert.strictEqual(dated.date.getMonth(), 10);
assert.strictEqual(dated.date.getDate(), 5);
assert.strictEqual(dated.category, 'Tagihan');

assert.strictEqual(context.parseTransaction_('makan siang', now).ok, false);

console.log('Semua pengujian parser lulus.');

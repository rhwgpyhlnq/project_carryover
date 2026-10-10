const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function load(file, dependencies = []) {
    let result;
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
        sap: { ui: { define: (_, factory) => { result = factory(...dependencies); } } }
    });
    return result;
}
const totals = load('webapp/ext/Totals.js');
test('sums decimal amounts exactly and keeps currencies separate', () => {
    const result = totals.calculate([
        { Currency: 'CNY', DebitCredit: 'S', Amount: '0.1' },
        { Currency: 'CNY', DebitCredit: 'S', Amount: '0.2' },
        { Currency: 'CNY', DebitCredit: 'H', Amount: '0.3' },
        { Currency: 'USD', DebitCredit: 'S', Amount: '999999999999999999.123' }
    ]);
    assert.equal(result[0].Debit, '0.30');
    assert.equal(result[0].Difference, '0.00');
    assert.equal(result[0].Balanced, true);
    assert.equal(result[1].Debit, '999999999999999999.123');
    assert.equal(result[1].Balanced, false);
    assert.throws(() => totals.calculate([{ Currency: 'CNY', DebitCredit: 'X', Amount: '1' }]));
});
test('invokes once per WBS/period, displays deep preview lines and clears busy state', async () => {
    let calls = 0, destroyed = 0, captured, busy;
    const model = {
        bindContext: () => ({ invoke: async () => { calls++; },
            getBoundContext: () => ({ requestObject: async () => ({ Status: 'S', Message: 'OK',
                _Lines: Array.from({ length: 100 }, (_, i) => ({
                    ItemNo: String(i), Currency: 'CNY', DebitCredit: i % 2 ? 'S' : 'H', Amount: '1'
                })) }) }),
            destroy: () => { destroyed++; } }),
        bindList: () => { throw new Error('Simulation must not read persisted history'); }
    };
    const dialog = { setModel: (m) => { captured = m.data; }, attachAfterClose: () => {}, open: () => {} };
    class JSONModel { constructor(data) { this.data = data; } setSizeLimit() {} }
    const module = load('webapp/ext/Simulation.js', [{ show: () => { busy = true; }, hide: () => { busy = false; } }, JSONModel,
        { error: (message) => { throw new Error(message); } }, totals]);
    // Match the actual FE callback receiver: deliberately no getView method.
    const api = { getModel: () => ({ getResourceBundle: async () => ({ getText: (key) => key }) }),
        loadFragment: async () => dialog };
    const context = { getObject: () => ({ CompanyCode: '1310', FiscalYear: '2026', FiscalPeriod: '003',
        Ledger: '0L', WBS: 'ECU99-05', Currency: 'CNY' }), getModel: () => model };
    await module.open.call(api, undefined, [context, context]);
    assert.equal(calls, 1);
    assert.equal(captured.Results[0].Lines.length, 100);
    assert.equal(captured.Results[0].Totals[0].Debit, '50.00');
    assert.equal(destroyed, 1);
    assert.equal(busy, false);
    await module.open.call(api, undefined, [context]);
    assert.equal(calls, 2, 'Can simulate again after the first invocation');
});

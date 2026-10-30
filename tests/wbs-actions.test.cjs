const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const row = { CompanyCode: '6842', FiscalYear: '2026', FiscalPeriod: '010', Ledger: '0L', WBS: "WBS/A'1", GLAccount: '824010101', Currency: 'CNY' };
function setup(eligible = true) {
    const seen = { paths: [], destroyed: 0, invoked: [], simulated: [], messages: [], refreshed: 0 };
    let module;
    const model = { bindContext(path) {
        seen.paths.push(path);
        return { requestObject: async () => ({ ...row, __OperationControl: { Posting: eligible, OffsetVoucher: eligible } }),
            getBoundContext: () => ({ getPath: () => path }), destroy: () => { seen.destroyed++; } };
    } };
    const api = { getModel: (name) => name === 'i18n' ? { getResourceBundle: async () => ({ getText: (key) => key }) } : model,
        getEditFlow: () => ({ invokeAction: async (action, options) => { seen.invoked.push({ action, options }); } }),
        refresh: async () => { seen.refreshed++; } };
    const messageBox = { information: (m) => seen.messages.push(m), error: (m) => seen.messages.push(m) };
    const simulation = { open: async function (_, contexts) { seen.simulated.push({ api: this, contexts }); } };
    vm.runInNewContext(fs.readFileSync('webapp/ext/WbsActions.js', 'utf8'), {
        sap: { ui: { define: (_, factory) => { module = factory(messageBox, simulation); } } }
    });
    return { module, api, seen };
}
const detail = (data = row) => ({ getObject: () => data });
test('rejects group headers and totals even when they carry all detail keys', async () => {
    const { module, api, seen } = setup();
    for (const context of [detail({ ...row, '@$ui5.node.isTotal': true }),
        detail({ ...row, '@$ui5.node.isExpanded': false }),
        { ...detail(), isExpanded: () => true }, detail({ WBS: row.WBS }), detail({ ...row, Currency: '' })]) {
        assert.equal(module.canRun(undefined, [context]), false);
        await module.post.call(api, undefined, [context]);
    }
    assert.equal(seen.paths.length, 0);
    assert.equal(seen.invoked.length, 0);
});
test('routes distinct detail contexts to Runs, escapes keys, and refreshes the analytical view after posting', async () => {
    const { module, api, seen } = setup();
    await module.post.call(api, undefined, [detail(), detail()]);
    assert.equal(seen.paths.length, 1);
    assert.ok(seen.paths[0].startsWith('/Runs('));
    assert.ok(seen.paths[0].includes("WBS='WBS%2FA''1'"));
    assert.ok(seen.paths[0].includes("FiscalPeriod='010'"));
    assert.equal(seen.invoked[0].action, 'com.sap.gateway.srvd.zui_pc_sim.v0001.Posting');
    assert.equal(seen.invoked[0].options.skipParameterDialog, false);
    assert.equal(seen.invoked[0].options.invocationGrouping, 'ChangeSet');
    assert.equal(seen.destroyed, 1);
    assert.equal(seen.refreshed, 1);
});
test('checks original backend operation control before invoking a financial action', async () => {
    const { module, api, seen } = setup(false);
    await module.offset.call(api, undefined, [detail()]);
    assert.equal(seen.invoked.length, 0);
    assert.equal(seen.destroyed, 1);
    assert.equal(seen.messages[0], 'wbsActionUnavailable');
});
test('simulation keeps the existing preview implementation and original ExtensionAPI receiver', async () => {
    const { module, api, seen } = setup();
    await module.simulate.call(api, undefined, [detail()]);
    assert.equal(seen.simulated.length, 1);
    assert.equal(seen.simulated[0].api, api);
    assert.ok(seen.simulated[0].contexts[0].getPath().startsWith('/Runs('));
    assert.equal(seen.invoked.length, 0);
    assert.equal(seen.destroyed, 1);
});
test('suppresses concurrent duplicate postings and allows a later new invocation', async () => {
    const { module, api, seen } = setup();
    await Promise.all([module.post.call(api, undefined, [detail()]), module.post.call(api, undefined, [detail()])]);
    assert.equal(seen.invoked.length, 1);
    await module.post.call(api, undefined, [detail()]);
    assert.equal(seen.invoked.length, 2);
});

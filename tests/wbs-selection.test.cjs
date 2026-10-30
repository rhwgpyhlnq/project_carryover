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
const base = { CompanyCode: '6842', FiscalYear: '2026', FiscalPeriod: '010', Ledger: '0L', WBS: '6842-202609-0003', GLAccount: '824010101', Currency: 'CNY' };
function fixture() {
    const module = load('webapp/ext/WbsSelection.js');
    const listeners = {};
    const rows = [];
    let notifications = 0;
    const header = { isSelected: () => false };
    const binding = { getAllCurrentContexts: () => rows, getHeaderContext: () => header,
        attachSelectionChanged: (fn) => { listeners.select = fn; }, attachChange: (fn) => { listeners.change = fn; },
        attachDataReceived: (fn) => { listeners.data = fn; } };
    function add(data = {}) {
        let selected = false;
        const context = { getObject: () => ({ ...base, ...data }), getBinding: () => binding,
            isSelected: () => selected, setSelected(value) {
                if (value === selected) return;
                selected = value;
                notifications++;
                assert.ok(notifications < 1000, 'selection handlers must not recurse indefinitely');
                listeners.select?.({ getParameter: () => context });
            } };
        rows.push(context);
        return context;
    }
    const table = { getSelectedContexts: () => rows.filter((r) => r.isSelected()), getAllCurrentContexts: () => rows };
    function click(context, value) {
        context.setSelected(value);
        module.onSelectionChange({ getSource: () => table });
    }
    return { module, rows, listeners, add, click, header };
}
test('one detail selects/deselects all accounts and currencies in exactly the same five-field group', () => {
    const f = fixture();
    const a = f.add();
    const b = f.add({ GLAccount: '825625101', Currency: 'USD' });
    const others = ['CompanyCode', 'FiscalYear', 'FiscalPeriod', 'Ledger', 'WBS'].map((key) => f.add({ [key]: 'different' }));
    f.click(a, true);
    assert.equal(b.isSelected(), true);
    assert.ok(others.every((r) => !r.isSelected()));
    f.click(b, false);
    assert.equal(a.isSelected(), false);
    assert.equal(b.isSelected(), false);
});
test('scrolling and reopening a collapsed group applies its remembered selection to newly loaded details', () => {
    const f = fixture();
    const a = f.add();
    f.click(a, true);
    const late = f.add({ GLAccount: '999' });
    f.listeners.data();
    assert.equal(late.isSelected(), true);
    f.click(late, false);
    const later = f.add({ GLAccount: '998' });
    f.listeners.change({ getParameter: () => 'Change' });
    assert.equal(later.isSelected(), false);
});
test('subtotals and grouping rows are never selected, including headers carrying all entity keys', () => {
    const f = fixture();
    const a = f.add();
    const total = f.add({ '@$ui5.node.isTotal': true });
    const collapsed = f.add({ '@$ui5.node.isExpanded': false });
    f.click(a, true);
    assert.equal(total.isSelected(), false);
    assert.equal(collapsed.isSelected(), false);
});
test('clearing all selection and changing the query discard remembered group selection', () => {
    for (const reason of ['Filter', 'Refresh', 'Sort', 'header']) {
        const f = fixture();
        f.click(f.add(), true);
        if (reason === 'header') f.listeners.select({ getParameter: () => f.header });
        else f.listeners.change({ getParameter: () => reason });
        const late = f.add({ GLAccount: '999' });
        f.listeners.data();
        assert.equal(late.isSelected(), false);
    }
});
test('two selected WBS groups remain independent and repeated macro callbacks are harmless', () => {
    const f = fixture();
    const a = f.add(), b = f.add({ WBS: 'second' }), c = f.add({ WBS: 'second', GLAccount: '999' });
    f.click(a, true);
    f.click(b, true);
    f.click(a, false);
    f.module.onSelectionChange({ getSource: () => ({ getSelectedContexts: () => [b,c] }) });
    assert.equal(a.isSelected(), false);
    assert.equal(c.isSelected(), true);
});

test('a new search clears selection and prevents restoring the previous WBS selection', () => {
    const f = fixture();
    const a = f.add();
    f.click(a, true);
    f.module.onBeforeRebindTable({ getSource: () => ({ getAllCurrentContexts: () => f.rows,
        clearSelection: () => f.rows.forEach((r) => r.setSelected(false)) }) });
    assert.equal(a.isSelected(), false);
    const late = f.add({ GLAccount: 'later' });
    f.listeners.data();
    assert.equal(late.isSelected(), false);
});
function readerFixture(request) {
    const seen = { filters: [], destroyed: 0, pages: [] };
    function Filter(...args) { this.args = args; }
    const selection = load('webapp/ext/WbsSelection.js');
    const reader = load('webapp/ext/WbsGroupData.js', [Filter, { EQ: 'EQ' }, selection]);
    const model = { bindList(path, context, sorters, filter) {
        assert.equal(path, '/Runs');
        seen.filters.push(filter);
        return { requestContexts: async (start, length) => {
            seen.pages.push([start, length]);
            return request(start, length).map((row) => ({ getObject: () => row }));
        }, destroy: () => { seen.destroyed++; } };
    } };
    return { reader, model, seen };
}
test('action preparation reads every page for each distinct selected group, including hidden accounts', async () => {
    const details = Array.from({ length: 205 }, (_, i) => ({ ...base, GLAccount: String(i) }));
    const f = readerFixture((start, length) => details.slice(start, start + length));
    const rows = await f.reader.read(f.model, [{ getObject: () => base }, { getObject: () => ({ ...base, GLAccount: 'another' }) }]);
    assert.equal(rows.length, 205);
    assert.deepEqual(f.seen.pages, [[0, 200], [200, 200]]);
    assert.equal(f.seen.filters.length, 1);
    assert.equal(f.seen.filters[0].args[0].filters.length, 5);
    assert.equal(f.seen.destroyed, 1);
});
test('incomplete or wrong-group responses stop action preparation and always dispose the reader', async () => {
    for (const data of [{ ...base, WBS: 'wrong' }, { ...base, GLAccount: '' }]) {
        const f = readerFixture(() => [data]);
        await assert.rejects(f.reader.read(f.model, [{ getObject: () => base }]), /Unexpected WBS/);
        assert.equal(f.seen.destroyed, 1);
    }
});

sap.ui.define([], function () {
    "use strict";

    const groupFields = ["CompanyCode", "FiscalYear", "FiscalPeriod", "Ledger", "WBS"];
    const detailFields = groupFields.concat(["GLAccount", "Currency"]);
    const states = new WeakMap();

    function isDetail(context) {
        if (!context || typeof context.getObject !== "function") { return false; }
        const row = context.getObject();
        return !!row && row["@$ui5.node.isTotal"] !== true &&
            row["@$ui5.node.isExpanded"] === undefined &&
            !(typeof context.isExpanded === "function" && context.isExpanded() !== undefined) &&
            detailFields.every(function (field) { return typeof row[field] === "string" && row[field].length > 0; });
    }

    function groupKey(row) {
        // JSON preserves field boundaries (WBS values can contain punctuation).
        return JSON.stringify(groupFields.map(function (field) { return row[field]; }));
    }

    function connect(binding, selectedContexts) {
        let state = states.get(binding);
        if (state) { return state; }
        state = { groups: new Map(), syncing: false };
        states.set(binding, state);

        state.sync = function () {
            if (state.syncing) { return; }
            state.syncing = true;
            try {
                binding.getAllCurrentContexts().forEach(function (context) {
                    if (!isDetail(context)) { return; }
                    const selected = state.groups.get(groupKey(context.getObject()));
                    if (selected !== undefined && context.isSelected() !== selected) {
                        context.setSelected(selected);
                    }
                });
            } finally { state.syncing = false; }
        };

        binding.attachSelectionChanged(function (event) {
            if (state.syncing) { return; }
            const context = event.getParameter("context");
            if (context === binding.getHeaderContext()) {
                state.groups.clear();
                // A header reset must not leave hidden groups selected in application state.
                if (context.isSelected()) {
                    binding.getAllCurrentContexts().filter(isDetail).forEach(function (detail) {
                        state.groups.set(groupKey(detail.getObject()), true);
                    });
                }
            } else if (isDetail(context)) {
                state.groups.set(groupKey(context.getObject()), context.isSelected());
            }
            state.sync();
        });
        binding.attachChange(function (event) {
            // Do not carry a business selection into a new query or a post-action refresh.
            if (["Filter", "Refresh", "Sort"].includes(event.getParameter("reason"))) {
                state.groups.clear();
            }
            state.sync();
        });
        binding.attachDataReceived(state.sync);
        selectedContexts.filter(isDetail).forEach(function (context) {
            state.groups.set(groupKey(context.getObject()), true);
        });
        return state;
    }

    function onSelectionChange(event) {
        const table = event.getSource();
        const selected = table.getSelectedContexts();
        // Use the context's public binding API, not generated inner table IDs/controls.
        const context = selected.find(isDetail) || table.getAllCurrentContexts()?.find(isDetail);
        if (!context) { return; }
        connect(context.getBinding(), selected).sync();
    }

    function onBeforeRebindTable(event) {
        const table = event.getSource();
        const context = table.getAllCurrentContexts()?.find(isDetail);
        const state = context && states.get(context.getBinding());
        if (state) { state.groups.clear(); }
        table.clearSelection();
    }

    return { onSelectionChange: onSelectionChange, onBeforeRebindTable: onBeforeRebindTable,
        isDetail: isDetail, groupKey: groupKey, groupFields: groupFields };
});

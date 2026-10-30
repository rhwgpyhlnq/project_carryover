/* global Promise */
sap.ui.define([
    "sap/m/MessageBox", "projectcarryover/ext/Simulation"
], function (MessageBox, Simulation) {
    "use strict";

    const keys = ["CompanyCode", "FiscalYear", "FiscalPeriod", "Ledger", "WBS", "GLAccount", "Currency"];
    const actionNamespace = "com.sap.gateway.srvd.zui_pc_sim.v0001.";
    const pending = new WeakSet();

    function isDetail(context) {
        if (!context || typeof context.getObject !== "function") { return false; }
        const row = context.getObject();
        if (!row || row["@$ui5.node.isTotal"] === true ||
            row["@$ui5.node.isExpanded"] !== undefined ||
            (typeof context.isExpanded === "function" && context.isExpanded() !== undefined)) { return false; }
        return keys.every(function (key) { return typeof row[key] === "string" && row[key].length > 0; });
    }

    function canRun(bindingContext, selectedContexts) {
        return Array.isArray(selectedContexts) && selectedContexts.length > 0 && selectedContexts.every(isDetail);
    }

    function detailPath(row) {
        return "/Runs(" + keys.map(function (key) {
            // Escape the OData string literal before encoding reserved URI characters.
            return key + "='" + encodeURIComponent(row[key].replace(/'/g, "''")) + "'";
        }).join(",") + ")";
    }

    async function invoke(api, selectedContexts, action) {
        if (pending.has(api)) { return; }
        pending.add(api);
        const bindings = [];
        try {
            const bundle = await api.getModel("i18n").getResourceBundle();
            if (!canRun(undefined, selectedContexts)) {
                MessageBox.information(bundle.getText("wbsSelectDetails"));
                return;
            }
            const model = api.getModel();
            const paths = Array.from(new Set(selectedContexts.map(function (context) { return detailPath(context.getObject()); })));
            for (const path of paths) {
                bindings.push(model.bindContext(path, undefined, { $$groupId: "$direct" }));
            }
            const rows = await Promise.all(bindings.map(function (binding) { return binding.requestObject(); }));
            if (action !== "Simulate" && rows.some(function (row) {
                return !row || !row.__OperationControl || row.__OperationControl[action] !== true;
            })) {
                MessageBox.information(bundle.getText("wbsActionUnavailable"));
                return;
            }
            const contexts = bindings.map(function (binding) { return binding.getBoundContext(); });
            if (action === "Simulate") {
                await Simulation.open.call(api, undefined, contexts);
            } else {
                await api.getEditFlow().invokeAction(actionNamespace + action, {
                    contexts: contexts,
                    model: model,
                    invocationGrouping: "ChangeSet",
                    label: bundle.getText(action === "Posting" ? "wbsPosting" : "wbsOffset"),
                    skipParameterDialog: false
                });
                // The action modifies Runs; refresh the separate analytical projection too.
                await api.refresh();
            }
        } catch (error) {
            // The edit-flow displays backend messages; cancellations must not become errors.
            if (error && error.message && !error.canceled && !error.cancelled) { MessageBox.error(error.message); }
        } finally {
            bindings.forEach(function (binding) { binding.destroy(); });
            pending.delete(api);
        }
    }

    return {
        canRun: canRun,
        simulate: function (bindingContext, selectedContexts) { return invoke(this, selectedContexts, "Simulate"); },
        post: function (bindingContext, selectedContexts) { return invoke(this, selectedContexts, "Posting"); },
        offset: function (bindingContext, selectedContexts) { return invoke(this, selectedContexts, "OffsetVoucher"); }
    };
});

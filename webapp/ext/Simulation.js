sap.ui.define([
    "sap/ui/core/BusyIndicator", "sap/ui/model/json/JSONModel", "sap/m/MessageBox",
    "projectcarryover/ext/Totals"
], function (BusyIndicator, JSONModel, MessageBox, Totals) {
    "use strict";
    const pending = new WeakSet();
    return {
        open: async function (bindingContext, selectedContexts) {
            // FPM binds manifest action handlers to ExtensionAPI, not Controller.
            const api = this;
            if (pending.has(api)) { return; }
            const bundle = await api.getModel("i18n").getResourceBundle();
            const contexts = selectedContexts || [];
            if (!contexts.length) { MessageBox.information(bundle.getText("previewSelect")); return; }
            const unique = new Map();
            contexts.forEach(function (context) {
                const row = context.getObject();
                unique.set(JSON.stringify([row.CompanyCode, row.FiscalYear, row.FiscalPeriod,
                    row.Ledger, row.WBS, row.Currency]), context);
            });
            const model = contexts[0].getModel();
            const results = [];
            pending.add(api);
            BusyIndicator.show(0);
            try {
                for (const context of unique.values()) {
                    const action = model.bindContext("com.sap.gateway.srvd.zui_pc_sim.v0001.Simulate(...)", context);
                    try {
                        await action.invoke("$direct");
                        const result = await action.getBoundContext().requestObject();
                        if (!result) { throw new Error(bundle.getText("previewNoResult")); }
                        if (!Array.isArray(result._Lines)) {
                            throw new Error(bundle.getText("previewNoResult"));
                        }
                        const lines = result._Lines.slice();
                        lines.sort(function (a, b) { return Number(a.ItemNo) - Number(b.ItemNo); });
                        results.push(Object.assign({}, result, {
                            Lines: lines, Totals: Totals.calculate(lines),
                            MessageType: result.Status === "E" ? "Error" : result.Status === "Z" ? "Warning" : "Success"
                        }));
                    } catch (error) {
                        const row = context.getObject();
                        results.push(Object.assign({}, row, { Message: error.message,
                            MessageType: "Error", Lines: [], Totals: [] }));
                    } finally {
                        action.destroy();
                    }
                }
                let dialog;
                dialog = await api.loadFragment({
                    name: "projectcarryover.ext.VoucherPreview", type: "XML",
                    controller: { close: function () { dialog.close(); } }
                });
                const preview = new JSONModel({ Results: results });
                preview.setSizeLimit(Math.max(1000, ...results.map(function (r) { return r.Lines.length; })));
                dialog.setModel(preview, "preview");
                dialog.attachAfterClose(function () { dialog.destroy(); preview.destroy(); });
                dialog.open();
            } catch (error) {
                MessageBox.error(error.message);
            } finally {
                BusyIndicator.hide();
                pending.delete(api);
            }
        }
    };
});

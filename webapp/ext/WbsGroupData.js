sap.ui.define([
    "sap/ui/model/Filter", "sap/ui/model/FilterOperator", "projectcarryover/ext/WbsSelection"
], function (Filter, FilterOperator, WbsSelection) {
    "use strict";

    // Read every detail of the selected business groups before calling an action.
    // A collapsed or not-yet-loaded analytical row must not be omitted from the operation.
    async function read(model, contexts) {
        const groups = new Map();
        contexts.forEach(function (context) {
            const row = context.getObject();
            groups.set(WbsSelection.groupKey(row), row);
        });
        const result = new Map();
        for (const row of groups.values()) {
            const filter = new Filter({ and: true, filters: WbsSelection.groupFields.map(function (field) {
                return new Filter(field, FilterOperator.EQ, row[field]);
            }) });
            const binding = model.bindList("/Runs", undefined, undefined, filter, {
                $$groupId: "$direct",
                $select: WbsSelection.groupFields.concat(["GLAccount", "Currency"]).join(",")
            });
            try {
                const pageSize = 200;
                for (let start = 0; ; start += pageSize) {
                    const page = await binding.requestContexts(start, pageSize);
                    page.forEach(function (context) {
                        if (!WbsSelection.isDetail(context) || WbsSelection.groupKey(context.getObject()) !== WbsSelection.groupKey(row)) {
                            throw new Error("Unexpected WBS detail response; no voucher action was submitted.");
                        }
                        const detail = context.getObject();
                        result.set(JSON.stringify(WbsSelection.groupFields.concat(["GLAccount", "Currency"]).map(function (field) {
                            return detail[field];
                        })), detail);
                    });
                    if (page.length < pageSize) { break; }
                }
            } finally { binding.destroy(); }
        }
        return Array.from(result.values());
    }

    return { read: read };
});

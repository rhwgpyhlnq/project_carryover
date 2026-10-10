sap.ui.define([], function () {
    "use strict";
    function decimal(value) {
        const text = String(value);
        if (!/^-?\d+(\.\d+)?$/.test(text)) { throw new Error("Invalid decimal amount: " + text); }
        const parts = text.replace("-", "").split(".");
        return { units: BigInt(parts.join("")) * (text.startsWith("-") ? -1n : 1n), scale: (parts[1] || "").length };
    }
    function display(units, scale) {
        const sign = units < 0n ? "-" : "";
        const digits = (units < 0n ? -units : units).toString().padStart(scale + 1, "0");
        return sign + (scale ? digits.slice(0, -scale) + "." + digits.slice(-scale) : digits);
    }
    return {
        calculate: function (lines) {
            const currencies = new Map();
            lines.forEach(function (line) {
                if (line.DebitCredit !== "S" && line.DebitCredit !== "H") { throw new Error("Invalid debit/credit code"); }
                const amount = decimal(line.Amount);
                const sum = currencies.get(line.Currency) || { debit: 0n, credit: 0n, scale: 2 };
                const scale = Math.max(sum.scale, amount.scale);
                const factor = 10n ** BigInt(scale - sum.scale);
                sum.debit *= factor; sum.credit *= factor;
                sum[line.DebitCredit === "S" ? "debit" : "credit"] += amount.units * 10n ** BigInt(scale - amount.scale);
                sum.scale = scale;
                currencies.set(line.Currency, sum);
            });
            return Array.from(currencies, function (entry) {
                const sum = entry[1];
                return { Currency: entry[0], Debit: display(sum.debit, sum.scale), Credit: display(sum.credit, sum.scale),
                    Difference: display(sum.debit - sum.credit, sum.scale), Balanced: sum.debit === sum.credit };
            });
        }
    };
});

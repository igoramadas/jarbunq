"use strict";
// Generic Email Action
// This is a generic email rule that will transfer the specified
// amount from the source account to the target account.
const bunq = require("../bunq");
const logger = require("anyhow");
const settings = require("setmeup").settings;
module.exports = async (message, rule) => {
    let descriptions = ["Email rule", `from ${rule.from.join(", ")}`];
    try {
        // Amount is mandatory.
        if (rule.amount == null) {
            throw new Error("Missing amount on rule definition");
        }
        // The target account is mandatory.
        if (rule.toAlias == null) {
            throw new Error("Missing the target account (toAlias) on rule definition");
        }
        // Use default account if fromAlias was not specified.
        if (rule.fromAlias == null) {
            rule.fromAlias = settings.bunq.accounts.main;
            logger.warn("EmailAction.Generic", message.messageId, `Missing fromAlias on rule definition, will use ${rule.fromAlias}`);
        }
        // Rule has a subject? Include in description.
        if (rule.subject != null) {
            descriptions.push(`subject: ${rule.subject}`);
        }
        // Generic payment options.
        const paymentOptions = {
            amount: rule.amount,
            description: descriptions.join(", "),
            toAlias: rule.toAlias,
            reference: message.messageId
        };
        await bunq.makePayment(paymentOptions);
        return true;
    }
    catch (ex) {
        throw ex;
    }
};

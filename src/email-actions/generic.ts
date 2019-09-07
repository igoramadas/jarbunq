// Generic Email Action
// This is a generic email rule that will transfer the specified
// amount from the source account to the target account.

import bunq = require("../bunq")
import logger = require("anyhow")
const settings = require("setmeup").settings

// Exported function. Always returns true (or rejects).
export = async (message: any, rule: any) => {
    logger.debug("EmailAction.Generic", message.messageId, message.from, message.subject, `To ${message.to}`)

    let descriptions = ["Email rule", `from ${rule.from.join(", ")}`]

    try {
        // Amount is mandatory.
        if (rule.amount == null) {
            throw new Error("Missing amount on rule definition")
        }

        // The target account is mandatory.
        if (rule.toAlias == null) {
            throw new Error("Missing the target account (toAlias) on rule definition")
        }

        // Use default account if fromAlias was not specified.
        if (rule.fromAlias == null) {
            rule.fromAlias = settings.bunq.accounts.main
            logger.warn("EmailAction.Generic", message.messageId, `Missing fromAlias on rule definition, will use ${rule.fromAlias}`)
        }

        // Rule has a subject? Include in description.
        if (rule.subject != null) {
            descriptions.push(`subject: ${rule.subject}`)
        }

        // Generic payment options.
        const paymentOptions = {
            amount: rule.amount,
            description: descriptions.join(", "),
            toAlias: rule.toAlias,
            reference: `generic-${message.messageId}`,
            notes: "Email action: generic"
        }

        await bunq.makePayment(paymentOptions)
        return true
    } catch (ex) {
        throw ex
    }
}

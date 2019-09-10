// Generic Email Action
// This is a generic email rule that will transfer the specified
// amount from the source account to the target account.

import bunq = require("../bunq")
import logger = require("anyhow")
const settings = require("setmeup").settings

// Email parsing strings.
const arrTotalText = ["Order Total Including VAT", "Order Grand Total", "Order Total", "Total Amount", "Total sum"]

// Exported function. Always returns true (or rejects).
export = async (message: any, rule: any) => {
    logger.debug("EmailAction.Generic", message.messageId, message.from, message.subject, `To ${message.to}`)

    let descriptions = ["Email rule", `from ${rule.from.join(", ")}`]
    let amount, partial

    try {
        // If rule has not amount specified, try to get from the email message.
        if (rule.amount == null) {
            let totalIndex = -1

            // Find where the total order is defined on the email plain text.
            for (let totalText of arrTotalText) {
                if (totalIndex < 0) {
                    totalIndex = message.text.indexOf(totalText)

                    if (totalIndex >= 0) {
                        partial = message.text.substring(totalIndex + totalText.length)
                        break
                    }
                }
            }

            // Find amount and remove unecessary characters.
            partial = partial.substring(0, partial.indexOf("\n"))
            partial = partial.replace(":", "").replace("=", "")
            partial = partial.replace(".", "").replace(",", ".")
            partial = partial.replace(/ /gi, "")

            if (isNaN(partial)) {
                throw new Error("Could not find the payment amount in the email message")
            }

            amount = parseFloat(partial)
        } else {
            amount = rule.amount
        }
        // No amount?
        if (amount == null) {
            throw new Error("Missing the rule amount, and no valid amount was found on the message")
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
            amount: amount,
            description: descriptions.join(", "),
            toAlias: rule.toAlias
        }

        return paymentOptions
    } catch (ex) {
        throw ex
    }
}

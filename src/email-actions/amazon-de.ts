// Amazon Email Action
// This will process orders from Amazon.de and automatically transfer the
// necessary money to the Amazon Card bunq account.

import logger = require("anyhow")
const settings = require("setmeup").settings

// Email parsing strings.
const arrTotalText = ["Order Total Including VAT", "Order Grand Total:", "Order Total:"]
const arrOrderNumberText = ["Order #", "Order  #:"]
const rewardPointsText = "Reward Points:"

// Helper to cleanup amount text.
const amountCleanup = function(value) {
    value = value.replace("EUR", "").replace(":", "")
    value = value.replace(".", "").replace(",", ".")
    return value.trim()
}

// Exported function.
const EmailAction = async (message: any): Promise<any> => {
    logger.debug("EmailAction.AmazonDe", message.messageId, message.from, message.subject, `To ${message.to}`)

    let amount: number | string, rewardAmount: number, paymentAmount: number
    let description: string, orderNumber: string, partial: string

    try {
        let totalIndex = -1
        let orderIndex = -1

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

        // Stop if amount not found.
        if (partial == null || partial == "") {
            return {error: "Can't find order amount on the email body"}
        }

        partial = partial.substring(0, partial.indexOf("\n"))

        // Only proceed if order was made in euros.
        if (!partial.includes("EUR")) {
            return {error: "Order amount not in EUR"}
        }

        // Get actual total amount.
        amount = amountCleanup(partial)

        // Parsing failed?
        if (isNaN(amount as number)) {
            return {error: "Could not find correct order amount"}
        }

        amount = parseFloat(amount as string)

        // Order has no amount (downloads for example)?
        if (amount < 0.01) {
            return {error: "Free order or download, no payment needed"}
        }

        // Set payment amount depending on the multiplier.
        paymentAmount = amount * settings.amazon.paymentMultiplier

        // Check if reward points were used, and subtract from order amount.
        let rewardIndex = message.text.indexOf(rewardPointsText)
        if (rewardIndex > 0) {
            partial = message.text.substring(rewardIndex + rewardPointsText.length)
            partial = partial.substring(0, partial.indexOf("\n"))
            partial = partial.replace("-", "")
            rewardAmount = amountCleanup(partial)

            // Reward amount found? Otherwise set to zero.
            if (isNaN(rewardAmount as number)) {
                rewardAmount = 0
            } else {
                rewardAmount = parseFloat(rewardAmount.toString())
                paymentAmount = paymentAmount - rewardAmount
            }
        }

        // Set transaction description based on order details.
        for (let orderNumberText of arrOrderNumberText) {
            if (orderIndex < 0) {
                orderIndex = message.text.indexOf(orderNumberText)

                if (orderIndex >= 0) {
                    partial = message.text.substring(orderIndex + orderNumberText.length)
                    partial = partial.substring(0, partial.indexOf("\n")).replace(":", "")
                    break
                }
            }
        }

        if (orderIndex < 0) {
            orderNumber = " with unkown reference"
        } else {
            orderNumber = partial.trim()
        }

        // Get order number and description.
        description = `Order ${orderNumber}, ${amount.toFixed(2)} EUR`

        // Set payment options.
        const paymentOptions: PaymentOptions = {
            amount: paymentAmount,
            description: description,
            toAlias: settings.bunq.accounts.amazon
        }

        // Add notes about reward points usage.
        if (rewardAmount > 0) {
            paymentOptions.notes = [`Used reward points: ${rewardAmount.toFixed(2)} EUR`]
        }

        return paymentOptions
    } catch (ex) {
        throw ex
    }
}

// Default rule for amazon-de action.
EmailAction.defaultRule = {
    from: "bestellbestaetigung@amazon.de",
    subject: "Amazon.de order"
}

// Exports...
export = EmailAction

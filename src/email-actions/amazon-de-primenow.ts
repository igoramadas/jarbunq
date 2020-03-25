// Amazon Prime Now Email Action
// This will process orders from Amazon.de Prime Now and automatically transfer the
// necessary money to the Amazon Card bunq account.

import logger = require("anyhow")
const settings = require("setmeup").settings

// Email parsing strings.
const arrTotalText = ["Endbetrag inkl. USt.:"]
const subjectOrderNumberText = "Bestellung #"

// Helper to cleanup amount text.
const amountCleanup = function(value) {
    value = value.replace("EUR", "").replace(":", "")
    value = value.replace(".", "").replace(",", ".")
    return value.trim()
}

// Exported function.
const EmailAction = async (message: any): Promise<any> => {
    logger.debug("EmailAction.AmazonDePrimeNow", message.messageId, message.from, message.subject, `To ${message.to}`)

    let amount: number | string, paymentAmount: number
    let description: string, orderNumber: string, partial: string
    let totalIndex = -1
    let orderIndex = -1

    try {
        if (!settings.bunq.accounts.amazon) {
            return {error: "The settings.bunq.accounts.amazon is not set."}
        }

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

        // Get actual total amount.
        amount = amountCleanup(partial)

        // Parsing failed?
        if (isNaN(amount as number)) {
            return {error: "Could not find correct order amount"}
        }

        amount = parseFloat(amount as string)

        // Order has no amount (downloads for example)?
        if (amount < 0.01) {
            return {error: "Free order, no payment needed"}
        }

        // Set payment amount depending on the multiplier.
        paymentAmount = amount * settings.amazon.paymentMultiplier

        // Try getting the order number from subject.
        orderIndex = message.subject.indexOf(subjectOrderNumberText)

        if (orderIndex < 0) {
            orderNumber = " unknown"
        } else {
            orderNumber = message.subject.substring(orderIndex + subjectOrderNumberText.length)
            orderNumber = orderNumber.substring(0, orderNumber.indexOf(" "))
            orderNumber = orderNumber.trim()
        }

        // Get order number and description.
        description = `Amazon Prime Now Order ${orderNumber}`

        // Set payment notes.
        const notes: string[] = [`Order total: ${amount.toFixed(2)} EUR`]

        // Set payment options.
        const paymentOptions: PaymentOptions = {
            amount: paymentAmount,
            description: description,
            toAlias: settings.bunq.accounts.amazon,
            notes: notes
        }

        return paymentOptions
    } catch (ex) {
        throw ex
    }
}

// Default rule for amazon-de action.
EmailAction.defaultRule = {
    from: "primenow-reply@amazon.de",
    subject: "Amazon Prime Now-Bestellung"
}

// Exports...
export = EmailAction

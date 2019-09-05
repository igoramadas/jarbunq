// Amazon Email Action
// This will process orders from Amazon.de and automatically transfer the
// necessary money to the Amazon Card account.

import bunq = require("../bunq")
import logger = require("anyhow")
const settings = require("setmeup").settings

// Email parsing strings.
const totalText = "Order Total Including VAT"
const totalTextNoVat = "Order Total:"
const orderNumberText = "Order #"

// Exported function. Will return false if order amount is not in EUR.
const EmailAction = async (message: any) => {
    let amount, description, orderNumber, partial

    try {
        // Find where the total order is defined on the email plain text.
        let totalIndex = message.text.indexOf(totalText)

        // Not found? Try option 2 (no VAT specified).
        if (totalIndex < 0) {
            totalIndex = message.text.indexOf(totalTextNoVat)
            partial = message.text.substring(totalIndex + totalTextNoVat.length)
        } else {
            partial = message.text.substring(totalIndex + totalText.length)
        }

        partial = partial.substring(0, partial.indexOf("\n"))

        // Only proceed if order was made in euros!
        if (!partial.includes("EUR")) {
            logger.warn("EmailAction.Amazon", message.messageId, "Order not in EUR, will not process")
            return false
        }

        // Get actual total amount.
        partial = partial.replace("EUR", "").replace(":", "")
        partial = partial.replace(".", "").replace(",", ".")
        amount = partial.trim()

        // Parsing failed?
        if (isNaN(amount)) {
            logger.warn("EmailAction.Amazon", message.messageId, "Could not find correct order amount, will not process")
            return false
        }

        // Order has no amount (downloads for example)?
        if (parseFloat(amount) < 0.01) {
            logger.warn("EmailAction.Amazon", message.messageId, "Free order or download, will not process")
            return false
        }

        // Set transaction description based on products.
        let orderIndex = message.text.indexOf(orderNumberText)
        partial = message.text.substring(orderIndex + orderNumberText.length)
        partial = partial.substring(0, partial.indexOf("\n")).trim()

        // Get order number and description.
        orderNumber = partial
        description = `Order ${orderNumber}, ${amount} EUR`

        // Set payment options.
        const paymentOptions = {
            amount: (parseFloat(amount) * settings.amazon.paymentMultiplier).toFixed(2),
            description: description,
            toAlias: settings.bunq.accounts.amazon,
            reference: `amazon-de-${message.messageId}`
        }

        await bunq.makePayment(paymentOptions)
        return true
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

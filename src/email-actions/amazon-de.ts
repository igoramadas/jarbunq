// Amazon Email Action
// This will process orders from Amazon.de and automatically transfer the
// necessary money to the Amazon Card account.

import bunq = require("../bunq")
import logger = require("anyhow")
const settings = require("setmeup").settings

// Email parsing strings.
const totalText = "Order Total Including VAT"
const orderNumberText = "Order #"

// Exported function. Will return false if order amount is not in EUR.
export = async (message: any) => {
    let amount, description, orderNumber, partial

    try {
        // Find where the total order is defined on the email plain text.
        let totalIndex = message.text.indexOf(totalText)
        partial = message.text.substring(totalIndex + totalText.length + 1)
        partial = partial.substring(0, partial.indexOf("\n"))

        // Only proceed if order was made in euros!
        if (!partial.includes("EUR")) {
            logger.warn("Email.Amazon", message.messageId, "Order not in EUR, will not process")
            return false
        }

        // Get actual total amount.
        partial = partial.replace("EUR", "").replace(",", ".")
        amount = partial.trim()

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
            reference: message.messageId
        }

        await bunq.makePayment(paymentOptions)
        return true
    } catch (ex) {
        throw ex
    }
}

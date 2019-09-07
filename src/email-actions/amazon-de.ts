// Amazon Email Action
// This will process orders from Amazon.de and automatically transfer the
// necessary money to the Amazon Card account.

import bunq = require("../bunq")
import logger = require("anyhow")
const settings = require("setmeup").settings

// Email parsing strings.
const arrTotalText = ["Order Total Including VAT", "Order Grand Total:", "Order Total:"]
const orderNumberText = "Order #"

// Exported function. Will return false if order amount is not in EUR.
const EmailAction = async (message: any) => {
    let amount, description, orderNumber, partial

    try {
        let totalIndex = -1

        // Find where the total order is defined on the email plain text.
        for (let totalText of arrTotalText) {
            if (totalIndex < 0) {
                totalIndex = message.text.indexOf(totalText)
            }
            if (totalIndex >= 0) {
                partial = message.text.substring(totalIndex + totalText.length)
            }
        }

        // Only proceed if order was made in euros!
        if (partial == null || partial == "") {
            return "Can't find order amount on the email body."
        }

        partial = partial.substring(0, partial.indexOf("\n"))

        // Only proceed if order was made in euros!
        if (!partial.includes("EUR")) {
            return "Order amount not in EUR"
        }

        // Get actual total amount.
        partial = partial.replace("EUR", "").replace(":", "")
        partial = partial.replace(".", "").replace(",", ".")
        amount = partial.trim()

        // Parsing failed?
        if (isNaN(amount)) {
            return "Could not find correct order amount"
        }

        // Order has no amount (downloads for example)?
        if (parseFloat(amount) < 0.01) {
            return "Free order or download, no payment needed"
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
        return null
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

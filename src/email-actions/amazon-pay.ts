// Amazon Pay Email Action
// This will process payments paid using Amazon Pay.

import logger = require("anyhow")
const settings = require("setmeup").settings

// Email parsing strings.
const arrTotalText = ["Charge amount"]
const arrMerchantText = ["Merchant information"]
const arrPaymentIdText = ["Amazon Pay payment ID"]

// Helper to cleanup amount text.
const amountCleanup = function(value) {
    value = value.replace("€", "").replace(":", "")
    value = value.replace(".", "").replace(",", ".")
    return value.trim()
}

// Exported function.
const EmailAction = async (message: any): Promise<any> => {
    logger.debug("EmailAction.AmazonPay", message.messageId, message.from, message.subject, `To ${message.to}`)

    if (message.text.indexOf("Amazon Pay") < 0) {
        return "Email not sent by Amazon Pay"
    }

    let amount: number | string, paymentAmount: number
    let description: string, merchant: string, paymentId: string, partial: string
    let totalIndex = -1
    let merchantIndex = -1
    let paymentIndex = -1

    try {
        if (!settings.bunq.accounts.amazon) {
            return {error: "The settings.bunq.accounts.amazon is not set."}
        }

        // Find where the payment value is defined on the email plain text.
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
            return {error: "Can't find payment amount on the email body"}
        }

        partial = partial.substring(0, partial.indexOf(" ") + 1)

        // Only proceed if payment was made in euros.
        if (!partial.includes("€")) {
            return {error: "Payment amount not in EUR"}
        }

        // Get actual total amount.
        amount = amountCleanup(partial)

        // Parsing failed?
        if (isNaN(amount as number)) {
            return {error: "Could not find correct payment amount"}
        }

        amount = parseFloat(amount as string)

        // Set payment amount depending on the multiplier.
        paymentAmount = amount * settings.amazon.paymentMultiplier

        // Find merchant.
        for (let merchantText of arrMerchantText) {
            if (merchantIndex < 0) {
                merchantIndex = message.text.indexOf(merchantText)

                if (merchantIndex >= 0) {
                    partial = message.text.substring(merchantIndex + merchantText.length)
                    partial = partial.substring(0, partial.indexOf("\n")).replace(":", "")
                    break
                }
            }
        }

        if (merchantIndex < 0) {
            merchant = "unkown merchant"
        } else {
            merchant = partial.replace("\n", "").trim()
        }

        // Get description using merchant name.
        description = `Amazon Payment to ${merchant}`

        // Find Amazon Pay payment ID.
        for (let paymentIdText of arrPaymentIdText) {
            if (paymentIndex < 0) {
                merchantIndex = message.text.indexOf(paymentIdText)

                if (merchantIndex >= 0) {
                    partial = message.text.substring(merchantIndex + paymentIdText.length)
                    partial = partial.substring(0, partial.indexOf("\n")).replace(":", "")
                    break
                }
            }
        }

        paymentId = partial.replace("\n", "").trim()

        // Set payment notes.
        const notes: string[] = [`Payment ID: ${paymentId}`]

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
    from: "no-reply@amazon.com",
    subject: "Your payment to",
    body: "We have processed"
}

// Exports...
export = EmailAction

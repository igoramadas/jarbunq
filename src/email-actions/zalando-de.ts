// Zalando Invoice Email Action
// This will process Zalando invoices sent via email and transfer
// the relevant amount to the Invoices bunq account.

import logger = require("anyhow")
const settings = require("setmeup").settings

// Email parsing strings.
const totalText = "Balance due"
const refText = "Payment ref:"

// Exported function. Will return false if Amazon account has enough funds
// to pay the bills (consider this a good thing!), otherwise true.
const EmailAction = async (message: any): Promise<any> => {
    logger.debug("EmailAction.ZalandoDe", message.messageId, message.from, message.subject, `To ${message.to}`)

    let invoiceAmount: number, description: string, partial: string

    try {
        // Find where the invoice amount is on the email text.
        let totalIndex = message.text.indexOf(totalText)
        partial = message.text.substring(totalIndex + totalText.length + 1)
        partial = partial.trimLeft().substring(0, partial.indexOf(" "))

        // Stop if amount not found.
        if (partial == null || partial == "") {
            return {error: "Can't find invoice amount on the email body"}
        }

        invoiceAmount = parseFloat(partial.trim())

        // Find payment reference (usually order number) and set description.
        let refIndex = message.text.indexOf(refText)
        partial = message.text.substring(refIndex + refText.length + 1)
        partial = partial.trimLeft().substring(0, partial.indexOf(" "))
        description = `Zalando Order ${partial.trim()}`

        // Set payment options.
        const paymentOptions: PaymentOptions = {
            amount: invoiceAmount,
            description: description,
            toAlias: settings.bunq.accounts.invoices
        }

        return paymentOptions
    } catch (ex) {
        throw ex
    }
}

// Default rule for lbb action.
EmailAction.defaultRule = {
    from: "info@service-mail.zalando.de",
    subject: "Thanks for your order",
    body: "pay for your order"
}

// Exports...
export = EmailAction

// LBB Amazon Card Email Action
// This will process invoices sent by LBB via email and make sure there
// are enough funds on the Amazon account for the direct debit.

import bunq = require("../bunq")
import logger = require("anyhow")
const settings = require("setmeup").settings

// Email parsing strings.
const totalText = "aktuellen Rechnungsbetrag von"

// Exported function. Will return false if Amazon account has enough funds
// to pay the bills (consider this a good thing!), otherwise true.
const EmailAction = async (message: any): Promise<any> => {
    logger.debug("EmailAction.Lbb", message.messageId, message.from, message.subject, `To ${message.to}`)

    let invoiceAmount, invoiceAmountString, description, partial

    try {
        // Find where the invoice amount is on the email text.
        let totalIndex = message.text.indexOf(totalText)
        partial = message.text.substring(totalIndex + totalText.length + 1)
        partial = partial.trim().substring(0, partial.indexOf(" "))
        partial = partial.replace(".", "")
        partial = partial.replace(",", ".")
        invoiceAmount = parseFloat(partial.trim())
        invoiceAmountString = invoiceAmount.toFixed(2)

        let balance = await bunq.getAccountBalance(settings.bunq.accounts.amazon)

        // Check how much is available at the Amazon account.
        if (balance >= invoiceAmount) {
            logger.info("EmailAction.Lbb", message.messageId, `Got invoice for ${invoiceAmountString}, current account balance is ${balance}, all good`)
            return null
        }

        logger.info("EmailAction.Lbb", `Invoice ${invoiceAmountString} is higher than current account balance ${balance}, will top-up`)

        // Set payment description.
        description = `Invoice top-up to ${invoiceAmountString}`

        // How much top-up is needed?
        const diffAmount = ((invoiceAmount - balance) * settings.amazon.paymentMultiplier).toFixed(2)

        // Set payment options.
        const paymentOptions: PaymentOptions = {
            amount: diffAmount,
            description: description,
            toAlias: settings.bunq.accounts.amazon
        }

        return paymentOptions
    } catch (ex) {
        throw ex
    }
}

// Default rule for lbb action.
EmailAction.defaultRule = {
    from: "noreply@lbb.de",
    subject: "Kreditkarten-Abrechnung online"
}

// Exports...
export = EmailAction

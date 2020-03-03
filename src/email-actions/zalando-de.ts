// Zalando Invoice Email Action
// This will process Zalando invoices sent via email and transfer
// the relevant amount to the Invoices bunq account. It might also
// schedule a draft payment to be made a few days later.

import logger = require("anyhow")
import scheduler = require("../scheduler")
import moment = require("moment")
const settings = require("setmeup").settings

// Email parsing strings.
const totalText = "Balance due"
const refText = "Payment ref:"

// Exported function.
const EmailAction = async (message: any): Promise<any> => {
    logger.debug("EmailAction.ZalandoDe", message.messageId, message.from, message.subject, `To ${message.to}`)

    let invoiceAmount: number, orderNumber: string, description: string, partial: string

    try {
        if (!settings.bunq.accounts.zalando) {
            return {error: "The settings.bunq.accounts.zalando is not set."}
        }

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

        orderNumber = partial.trim()
        description = `Zalando Order ${orderNumber}`

        // Set payment options.
        const paymentOptions: PaymentOptions = {
            amount: invoiceAmount,
            description: description,
            toAlias: settings.bunq.accounts.zalando
        }

        // Schedule invoice payment from the Zalando account to Zalando
        // a few days later, depending on the autoScheduleDays setting.
        if (settings.zalando.autoScheduleDays && settings.zalando.autoScheduleDays > 0) {
            const targetDate = moment().add(settings.zalando.autoScheduleDays, "days")

            // Job specs.
            const job: ScheduledJob = {
                date: targetDate.toDate(),
                title: `Zalando invoice ${orderNumber}`,
                type: "payment",
                options: {
                    draft: true,
                    amount: invoiceAmount,
                    description: description,
                    fromAlias: settings.bunq.accounts.zalando,
                    toAlias: settings.zalando.iban,
                    toName: settings.zalando.name,
                    notes: [`Auto scheduled at ${targetDate.format("ll")}`]
                }
            }

            scheduler.queue(job)

            return `Payment of ${invoiceAmount.toFixed(2)} scheduled to ${targetDate.format("ll")}`
        }

        return paymentOptions
    } catch (ex) {
        throw ex
    }
}

// Default rule for zalando action.
EmailAction.defaultRule = {
    from: "info@service-mail.zalando.de",
    subject: "Thanks for your order",
    body: "pay for your order"
}

// Exports...
export = EmailAction

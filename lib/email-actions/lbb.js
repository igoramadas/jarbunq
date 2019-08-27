"use strict";
// LBB Amazon Card Email Processor
// This will process invoices sent by LBB via email and make sure there
// are enough funds on the Amazon account for the direct debit.
const bunq = require("../bunq");
const logger = require("anyhow");
const settings = require("setmeup").settings;
// Add a 0.5% on top of the total value found on the email (for occasional fees).
const paymentBuffer = 1.002;
// Email parsing strings.
const totalText = "Den aktuellen Rechnungsbetrag von ";
module.exports = async (message) => {
    let invoiceAmount, description, partial;
    try {
        // Find where the invoice amount is on the email text.
        let totalIndex = message.text.indexOf(totalText);
        partial = message.text.substring(totalIndex + totalText.length + 1);
        partial = partial.substring(0, partial.indexOf(" "));
        partial = partial.replace(",", ".");
        invoiceAmount = partial.trim();
        let balance = await bunq.getAccountBalance(settings.bunq.accounts.amazon);
        // Check how much is available at the Amazon account.
        if (balance >= invoiceAmount) {
            logger.info("EmailAction.Lbb", `Got invoice for ${invoiceAmount}, current account balance is ${balance}`);
        }
        else {
            logger.warn("EmailAction.Lbb", `Invoice ${invoiceAmount} is higher than current account balance ${balance}`);
            // Set payment description.
            description = `Invoice top-up to ${invoiceAmount}`;
            // How much top-up is needed?
            const diffAmount = ((invoiceAmount - balance) * paymentBuffer).toFixed(2);
            const paymentOptions = {
                amount: diffAmount,
                description: description,
                toAlias: settings.bunq.accounts.amazon,
                reference: message.messageId
            };
            await bunq.makePayment(paymentOptions);
        }
    }
    catch (ex) {
        let logReference = description || message.subject;
        logger.error("EmailAction.Lbb", logReference, ex);
    }
};

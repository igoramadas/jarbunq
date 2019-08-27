"use strict";
// Amazon Email Processor
// This will process orders from Amazon.de and automatically transfer the
// necessary money to the Amazon Card account, with an added 0.5% buffer.
const bunq = require("../bunq");
const logger = require("anyhow");
const settings = require("setmeup").settings;
// Add a 0.5% on top of the total value found on the email (for occasional fees).
const paymentBuffer = 1.005;
// Email parsing strings.
const totalText = "Order Total Including VAT";
const orderNumberText = "Order #";
module.exports = async (message) => {
    let amount, description, orderNumber, partial;
    try {
        // Find where the total order is defined on the email plain text.
        let totalIndex = message.text.indexOf(totalText);
        partial = message.text.substring(totalIndex + totalText.length + 1);
        partial = partial.substring(0, partial.indexOf("\n"));
        // Only proceed if order was made in euros!
        if (!partial.includes("EUR")) {
            logger.warn("Email.Amazon", "Order not in EUR, will not process", message.subject);
            return null;
        }
        // Get actual total amount.
        partial = partial.replace("EUR", "").replace(",", ".");
        amount = partial.trim();
        // Set transaction description based on products.
        let orderIndex = message.text.indexOf(orderNumberText);
        partial = message.text.substring(orderIndex + orderNumberText.length);
        partial = partial.substring(0, partial.indexOf("\n")).trim();
        // Get order number and description.
        orderNumber = partial;
        description = `Order ${orderNumber}, ${amount}`;
        logger.info("EmailAction.Amazon", orderNumber, amount, message.subject);
        const paymentOptions = {
            amount: (parseFloat(amount) * paymentBuffer).toFixed(2),
            description: description,
            toAlias: settings.bunq.accounts.amazon,
            reference: message.messageId
        };
        await bunq.makePayment(paymentOptions);
    }
    catch (ex) {
        let logReference = description || orderNumber || message.subject;
        logger.error("EmailAction.Amazon", logReference, ex);
    }
};

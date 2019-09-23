// EmailManager

import {Payment} from "./types"
import _ = require("lodash")
import database = require("database")
import EmailAccount = require("./email-account")
import logger = require("anyhow")
import moment = require("moment")
import notifications = require("./notifications")
const settings = require("setmeup").settings

/**
 * Manages email accounts, defined as [[EmailAccount]].
 */
class EmailManager extends require("./base-events") {
    private static _instance: EmailManager
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    // PROPERTIES
    // --------------------------------------------------------------------------

    /** Email accounts. */
    accounts: EmailAccount[] = []

    /** SMTP client created via Nodemailer. */
    smtp: any

    // MAIN METHODS
    // --------------------------------------------------------------------------

    /**
     * Init the email accounts.
     */
    async init() {
        this.start()
    }

    /**
     * Start parsing relevant messages on the mail server.
     * @event start
     */
    start = () => {
        if (this.accounts.length > 0) {
            logger.warn("EmailManager.start", `Already started with ${this.accounts.length} accounts. Abort.`)
            return
        }
        if (settings.email.accounts == null) {
            logger.warn("EmailManager.start", "No accounts defined on the settings. Abort.")
            return
        }

        this.accounts = []

        const keys = Object.keys(settings.email.accounts)
        logger.info("EmailManager.start", `Will start ${keys.length} account(s)`)

        // Start emaikl accounts.
        for (let id of keys) {
            const account = new EmailAccount(id, settings.email.accounts[id])
            this.accounts.push(account)
            account.start()
        }

        // No accounts found? Log an alert.
        if (this.accounts.length == 0) {
            logger.warn("EmailManager.start", "No accounts found. Please make sure you have accounts set via settings.email.accounts.")
        }

        const accountIds = _.map(this.accounts, "id")
        this.events.emit("start", accountIds)
    }

    /**
     * Stops parsing messages on the mail server.
     * @event stop
     */
    stop = () => {
        const accountIds = _.map(this.accounts, "id")

        for (let account of this.accounts) {
            account.stop()
        }

        this.accounts = []
        this.events.emit("stop", accountIds)
    }

    // WEEKLY PAYMENTS NOTIFICATION
    // --------------------------------------------------------------------------

    /**
     * Send a weekly summary report of payments to the account owner.
     */
    sendWeeklySummary = () => {
        try {
            const yesterday = moment().subtract(1, "days")
            yesterday.hours(23)
            yesterday.minutes(59)
            yesterday.seconds(59)

            const minDate = moment().subtract(7, "days")
            minDate.hours(0)
            minDate.minutes(0)
            minDate.seconds(0)

            // Filter function to grab payments for the last 7 days.
            const filter = p => {
                const pDate = moment(p.date)
                return pDate.isSameOrAfter(minDate) && pDate.isSameOrBefore(yesterday)
            }

            // Fetch payments from last week.
            const dbPayments = database.get("payments").filter(filter)
            const payments = dbPayments.value() as Payment[]
            const paymentStrings = []

            // Iterate payments to build email message.
            if (payments && payments.length > 0) {
                for (let payment of payments) {
                    let notes

                    // Payment has notes?
                    if (payment.notes && payment.notes.length > 0) {
                        notes = "\n" + (payment.notes as string[]).join("\n")
                    } else {
                        notes = ""
                    }

                    const paymentTitle = payment.draft ? "Draft payment" : "Payment"

                    // Create payment HTML string.
                    let msg = `<div><strong>${paymentTitle} ${payment.id}</strong>
                               \n
                               From ${payment.fromAlias} to ${payment.toAlias}
                               \n
                               Total: ${payment.amount} ${payment.currency}
                               \n
                               ${payment.description}
                               ${notes}
                               </div>`

                    paymentStrings.push(msg)
                }
            } else {
                paymentStrings.push("No payments were made in this period. Strange... :-(")
            }

            // Build subject and message strings.
            const subject = `Weekly payment report from ${settings.app.title}`
            const message = `Aloha! This is your weekly report of payments triggered by Jarbunq last week,
                             from ${minDate.format("ll")} to ${yesterday.format("ll")}.
                             \n\n
                             ${paymentStrings.join("\n")}`

            //Send email!
            notifications.toEmail({subject: subject, message: message})
        } catch (ex) {
            logger.error("EmailManager.sendWeeklySummary", ex)
        }
    }
}

// Exports...
export = EmailManager.Instance

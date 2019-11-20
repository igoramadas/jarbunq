// EmailManager

import _ = require("lodash")
import bunq = require("./bunq")
import database = require("./database")
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

    /** Timer to send the weekly reports. */
    timerWeeklyReport: any

    // MAIN METHODS
    // --------------------------------------------------------------------------

    /**
     * Init the email accounts.
     */
    init = async (): Promise<void> => {
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

        // Send weekly reports?
        if (settings.email.weeklyReports) {
            const now = moment()
            const target = moment().hours(6)
            const day = now.isoWeekday()
            let interval = 0

            // If Monday between 6 and 7 AM send straight away,
            // otherwise calculate correct schedule for next Monday.
            if (day == 1) {
                if (now.isAfter(target) && now.hours() < 8) {
                    this.sendWeeklyReport()
                } else {
                    interval = target.diff(now)
                }
            } else {
                target.add(8 - day, "days")
                interval = target.diff(now)
            }

            // Report needs to be scheduled?
            if (interval > 0) {
                this.timerWeeklyReport = setTimeout(this.sendWeeklyReport, interval)
                logger.debug("EmailManager.start", `Weekly report will be sent ${moment.duration(interval).humanize(true)}`)
            }
        }

        // Dispatch start event.
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

        if (this.timerWeeklyReport) {
            clearTimeout(this.timerWeeklyReport)
            this.timerWeeklyReport = null
        }

        this.accounts = []
        this.events.emit("stop", accountIds)
    }

    // WEEKLY PAYMENTS NOTIFICATION
    // --------------------------------------------------------------------------

    /**
     * Send a weekly summary report of payments to the account owner.
     * @event sendWeeklyReport
     */
    sendWeeklyReport = () => {
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
                        notes = "<br>" + (payment.notes as string[]).join("<br>")
                    } else {
                        notes = ""
                    }

                    const paymentTitle = payment.draft ? "Draft payment" : "Payment"
                    let fromAccount = payment.fromAlias
                    let toAccount = payment.toAlias

                    // Get actual account names.
                    try {
                        fromAccount = bunq.getAccountFromAlias(payment.fromAlias).description
                        toAccount = bunq.getAccountFromAlias(payment.toAlias).description
                    } catch (ex) {
                        logger.warn("EmailManager.sendWeeklySummary", ex)
                    }

                    // Create payment HTML string.
                    let msg = `<div><b>${payment.description}</b>
                               <br>
                               <b>${payment.amount.toFixed(2)} ${payment.currency}</b>
                               from ${fromAccount} to ${toAccount}
                               ${notes}
                               <br>
                               <small>${paymentTitle} ${payment.id}</small>
                               </div>`

                    paymentStrings.push(msg)
                }
            } else {
                paymentStrings.push("No payments were made in this period. Strange, isn't it? :-(")
            }

            // Build subject and message strings.
            const subject = `Weekly payment report from ${settings.app.title}`
            const message = `Aloha! This is your weekly report of payments triggered by Jarbunq last week,
                             from ${minDate.format("ll")} to ${yesterday.format("ll")}.
                             \n-\n
                             ${paymentStrings.join("\n-\n")}`

            //Send email!
            notifications.toEmail({subject: subject, message: message})
            this.events.emit("sendWeeklyReport", payments)
        } catch (ex) {
            logger.error("EmailManager.sendWeeklySummary", ex)
        }

        // Schedule next report for next week.
        this.timerWeeklyReport = setTimeout(this.sendWeeklyReport, 604800000)
    }
}

// Exports...
export = EmailManager.Instance

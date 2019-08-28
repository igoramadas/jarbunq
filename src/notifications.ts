// Notifications

import BaseEvents = require("./base-events")

const fs = require("fs")
const logger = require("anyhow")
const nodemailer = require("nodemailer")
const settings = require("setmeup").settings

/**
 * Used to send notifications to users.
 */
class Notifications extends BaseEvents {
    private static _instance: Notifications
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    // PROPERTIES
    // --------------------------------------------------------------------------

    /** SMTP client created via Nodemailer. */
    smtp: any

    // METHODS
    // --------------------------------------------------------------------------

    /**
     * Init the notifications module.
     */
    async init() {
        if (!settings.email.smtp || !settings.email.smtp.auth) {
            logger.warn("Notifications.init", "Missing SMTP settings on settings.email.smtp, so emails will NOT be sent.")
            return
        }

        // Set SMTP 'pass' from 'password'.
        if (settings.email.smtp.auth.password) {
            settings.email.smtp.auth.pass = settings.email.smtp.auth.password
        }

        // Create and verify SMTP client.
        this.smtp = nodemailer.createTransport(settings.email.smtp)
        this.smtp.verify(err => {
            if (err) {
                logger.error("Notifications.init", "Invalid SMTP settings", err)
            } else {
                logger.info("Notifications.init", "SMTP client ready", settings.email.smtp.host)
            }
        })
    }

    /**
     * Sends an email via SMTP.
     * @param options Email sending options with to, subject, body etc.
     * @event toEmail
     */
    toEmail = async (options: EmailOptions) => {
        try {
            // Set default from and to.
            if (!options.from) {
                options.from = settings.email.from
            }
            if (!options.to) {
                options.to = settings.email.to
            }

            // Keywords to be replaced on the template.
            const keywords = {
                appTitle: settings.app.title,
                appUrl: settings.app.url,
                owner: settings.app.owner,
                message: options.message
            }

            // Load template and replace keywords.
            let template = fs.readFileSync(__dirname + "/../assets/email-template.html", {encoding: settings.general.encoding})
            for (let [key, value] of Object.entries(keywords)) {
                template = template.split(`{{ ${key} }}`).join(value)
            }

            // Set the email HTML based on the loaded template and message.
            options.html = template

            await this.smtp.sendMail(options)

            this.events.emit("toEmail", options)
            logger.info("Notifications.toEmail", options.to, options.subject)
        } catch (ex) {
            logger.error("Notifications.toEmail", options.to, options.subject, ex)
        }
    }
}

/**
 * Defines email sending options.
 */
interface EmailOptions {
    /** The email subject. */
    subject: string
    /** The actual message to be sent. */
    message?: string
    /** The sender email address. If unspecified, will use defaul from settings. */
    from?: string
    /** The target email address. */
    to?: string
    /** The actual HTML to be sent out (filled automatically during send, by using template + message). */
    html?: string
}

// Exports...
export = Notifications.Instance

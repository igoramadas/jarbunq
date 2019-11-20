// Notifications

import fs = require("fs")
import logger = require("anyhow")
import nodemailer = require("nodemailer")
import request = require("request-promise-native")
const settings = require("setmeup").settings

/**
 * Used to send notifications to users. Right now only email is supported.
 * Not to be confused with bunq notification filers, which are handled
 * directly on the Bunq class (bunq.ts).
 */
class Notifications extends require("./base-events") {
    private static _instance: Notifications
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    // PROPERTIES
    // --------------------------------------------------------------------------

    /** SMTP client created via Nodemailer. */
    smtp: any

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the notifications module.
     */
    init = async (): Promise<void> => {
        if (!settings.email.smtp || !settings.email.smtp.host || !settings.email.smtp.auth) {
            logger.warn("Notifications.init", "Missing SMTP settings on settings.email.smtp, so emails will NOT be sent")
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

    // SENDING METHODS
    // --------------------------------------------------------------------------

    /**
     * Sends a notification to the user. This acts as a generic wrapper, so
     * if a push service is enabled it will via push otherwise, it will send
     * the notification via email.
     * @param options Notification options with subject and message.
     * @event send
     */
    send = async (options: BaseNotificationOptions) => {
        logger.debug("Notifications.send", options)

        if (settings.notification.push.enabled) {
            this.toPush(options as PushNotificationOptions)
        } else if (this.smtp) {
            this.toEmail(options as EmailNotificationOptions)
        } else {
            logger.warn("Notifications.send", "Push service not enabled and SMTP not registered, will not send", options.subject, options.message)
        }

        // You can also write your own notification handler by listening to the `send` event.
        this.events.emit("send", options)
    }

    /**
     * Sends an email via SMTP.
     * @param options Email sending options with to, subject, body etc.
     * @event toEmail
     */
    toEmail = async (options: EmailNotificationOptions): Promise<void> => {
        logger.debug("Notifications.toEmail", options)

        try {
            // Set default from.
            if (!options.from) {
                options.from = settings.email.from
            }

            // Set default to.
            if (!options.to) {
                options.to = settings.email.to
            }

            // Warn if SMTP settings are not defined, but only if no toEmail listeners are attached.
            if (this.smtp == null) {
                if (this.events.listeners("toEmail").length == 0) {
                    logger.warn("Notifications.toEmail", "SMTP settings not defined, will NOT send", options.to, options.subject)
                }

                return
            }

            // Compact message.
            let message: string = options.message
            message = message.replace(/ /, "").trim()

            // Keywords to be replaced on the template.
            const keywords = {
                appTitle: settings.app.title,
                appUrl: settings.app.url,
                owner: settings.app.owner ? settings.app.owner : "fellow bunqer",
                message: message
            }

            // Load template and replace keywords.
            let template = fs.readFileSync(__dirname + "/../assets/email-template.html", {encoding: settings.general.encoding as string})
            for (let [key, value] of Object.entries(keywords)) {
                template = template.split(`{{ ${key} }}`).join(value)
            }

            // Set the email HTML based on the loaded template and message.
            options.html = template

            await this.smtp.sendMail(options)

            logger.info("Notifications.toEmail", options.to, options.subject)
            this.events.emit("toEmail", options)
        } catch (ex) {
            // Notifications should never throw / reject, so we just log it here.
            logger.error("Notifications.toEmail", options.to, options.subject, ex)
        }
    }

    /**
     * Send a push notification to the configured push service.
     * @param options Notification options with subject, message and data.
     * @event toPush
     */
    toPush = async (options: PushNotificationOptions): Promise<void> => {
        if (!settings.notification.push.enabled) {
            logger.error("Notifications.toPush", "Not enabled on settings, will not send", options.subject, options.message)
            return
        }

        // The push service URL is mandatory.
        if (!settings.notification.push.url) {
            logger.error("Notifications.toPush", "Misssing settings.notification.push.url", "Please set the destination URL on your settings.private.json file.")
            return
        }

        try {
            const post = settings.notification.push.post !== false

            // Replace HTML tags and compact message.
            let message: string = options.message
            message = message.replace(/<br\s*[\/]?>/gi, "\n")
            message = message.replace(/ /, "").trim()

            // Set request options.
            let reqOptions: any = {
                method: post ? "POST" : "GET",
                uri: settings.notification.push.url,
                json: true,
                resolveWithFullResponse: true
            }

            // Using POST with body, or GET with querystrings?
            if (post) {
                reqOptions.body = settings.notification.push.post || {}
                reqOptions.body[settings.notification.push.subjectField] = options.subject
                reqOptions.body[settings.notification.push.messageField] = message
            } else {
                reqOptions.qs = {}
                reqOptions.qs[settings.notification.push.subjectField] = options.subject
                reqOptions.qs[settings.notification.push.messageField] = message
            }

            // Send request to push API.
            let res = await request(reqOptions)
            let result: string

            // Parse proper response body.
            if (res.body) {
                result = res.body.request || res.body.message || res.body.id || res.body.status || Object.values(res.body).join(", ")
            } else {
                result = "Empty response"
            }

            logger.info("Notification.toPush", options.subject, result)
            this.events.emit("toPush", options)
        } catch (ex) {
            logger.error("Notification.toPush", options.subject, ex)
        }
    }
}

// Exports...
export = Notifications.Instance

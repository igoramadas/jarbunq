"use strict";
// Notifications
const BaseEvents = require("./base-events");
const fs = require("fs");
const logger = require("anyhow");
const nodemailer = require("nodemailer");
const settings = require("setmeup").settings;
/**
 * Used to send notifications to users.
 */
class Notifications extends BaseEvents {
    constructor() {
        super(...arguments);
        /**
         * Sends an email via SMTP.
         * @param options Email sending options with to, subject, body etc.
         * @event toEmail
         */
        this.toEmail = async (options) => {
            try {
                if (!options.from) {
                    options.from = settings.email.from;
                }
                if (!options.to) {
                    options.to = settings.email.to;
                }
                // Warn if SMTP settings are not defined, but only if no toEmail listeners are attached.
                if (this.smtp == null) {
                    if (this.events.listeners("toEmail").length == 0) {
                        logger.warn("Notifications.toEmail", "SMTP settings not defined, will NOT send", options.to, options.subject);
                    }
                    return;
                }
                // Keywords to be replaced on the template.
                const keywords = {
                    appTitle: settings.app.title,
                    appUrl: settings.app.url,
                    owner: settings.app.owner,
                    message: options.message
                };
                // Load template and replace keywords.
                let template = fs.readFileSync(__dirname + "/../assets/email-template.html", { encoding: settings.general.encoding });
                for (let [key, value] of Object.entries(keywords)) {
                    template = template.split(`{{ ${key} }}`).join(value);
                }
                // Set the email HTML based on the loaded template and message.
                options.html = template;
                await this.smtp.sendMail(options);
                logger.info("Notifications.toEmail", options.to, options.subject);
            }
            catch (ex) {
                logger.error("Notifications.toEmail", options.to, options.subject, ex);
            }
        };
    }
    static get Instance() {
        return this._instance || (this._instance = new this());
    }
    // METHODS
    // --------------------------------------------------------------------------
    /**
     * Init the notifications module.
     */
    async init() {
        if (!settings.email.smtp || !settings.email.smtp.auth) {
            logger.warn("Notifications.init", "Missing SMTP settings on settings.email.smtp, so emails will NOT be sent.");
            return;
        }
        // Set SMTP 'pass' from 'password'.
        if (settings.email.smtp.auth.password) {
            settings.email.smtp.auth.pass = settings.email.smtp.auth.password;
        }
        // Create and verify SMTP client.
        this.smtp = nodemailer.createTransport(settings.email.smtp);
        this.smtp.verify(err => {
            if (err) {
                logger.error("Notifications.init", "Invalid SMTP settings", err);
            }
            else {
                logger.info("Notifications.init", "SMTP client ready", settings.email.smtp.host);
            }
        });
    }
}
module.exports = Notifications.Instance;

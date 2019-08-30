"use strict";
// EmailAccount
const BaseEvents = require("./base-events");
const _ = require("lodash");
const database = require("./database");
const imap = require("imap");
const mailparser = require("mailparser");
const moment = require("moment");
const logger = require("anyhow");
let settings;
/**
 * Represents a single IMAP mail account.
 */
class EmailAccount extends BaseEvents {
    /** Default EmailAccount constructor. */
    constructor(id, config) {
        super();
        settings = require("setmeup").settings;
        this.id = id;
        this.config = config;
        logger.info("EmailAccount", id, config.host);
    }
    // MAIN METHODS
    // --------------------------------------------------------------------------
    /**
     * Start parsing relevant messages on the mail server.
     * @event start
     */
    start() {
        this.messageIds = {};
        this.client = new imap(this.config);
        this.openBox(true);
        this.events.emit("start");
    }
    /**
     * Stops parsing messages on the mail server.
     * @event stop
     */
    stop() {
        try {
            this.client.closeBox();
            this.client.end();
            this.client = null;
        }
        catch (ex) {
            logger.error("EmailAccount.stop", this.id, ex);
        }
        this.events.emit("stop");
    }
    // METHODS
    // --------------------------------------------------------------------------
    /**
     * Opens the mailbox.
     * @param retry When true it will retry opening the mailbox if failed.
     */
    openBox(retry) {
        if (this.client && this.client.state == "authenticated") {
            return logger.warn("EmailAccount.openBox", this.id, "Already connected. Abort.");
        }
        // Once IMAP is ready, open the inbox and start listening to messages.
        this.client.once("ready", () => {
            this.client.openBox(this.config.inboxName, false, err => {
                if (err) {
                    logger.warn("EmailAccount.openBox", this.id, err);
                    // Auth failed? Do not try again.
                    if (err.textCode == "AUTHORIZATIONFAILED") {
                        return logger.error("EmailAccount.openBox", this.id, "Auth failed, please check user and password");
                    }
                    // Retry connection?
                    if (retry) {
                        return _.delay(this.openBox, settings.email.retryInterval, false);
                    }
                    return logger.error("EmailAccount.openBox", this.id, "Failed to connect");
                }
                else {
                    logger.info("EmailAccount.openBox", this.id, "Inbox ready");
                    // Start fetching unseen messages immediately.
                    const since = moment()
                        .subtract(settings.email.fetchHours, "hours")
                        .toDate();
                    this.fetchMessages(since);
                    this.client.on("mail", () => this.fetchMessages());
                }
            });
        });
        // Handle IMAP errors. If disconnected because of connection reset, call openBox again.
        this.client.on("error", err => {
            logger.error("EmailAccount.openBox.onError", this.id, err);
            if (err.code == "ECONNRESET") {
                return _.delay(this.openBox, settings.imap.retryInterval, true);
            }
        });
        // Connect to the IMAP server.
        return this.client.connect();
    }
    /**
     * Fetch new unread messages for the specified account.
     * @param since Optional date, if not specified will fetch new / unseen messages.
     */
    fetchMessages(since) {
        let query = since ? ["SINCE", since] : "UNSEEN";
        return this.client.search([query], (err, results) => {
            if (err) {
                return logger.error("EmailAccount.fetchMessages", this.id, err);
            }
            if (results == null || results.length < 1) {
                return logger.info("EmailAccount.fetchMessages", this.id, "No new messages");
            }
            const fetcher = this.client.fetch(results, { size: true, struct: true, markSeen: false, bodies: "" });
            fetcher.on("message", msg => this.downloadMessage(msg));
            fetcher.once("error", err => logger.error("EmailAccount.fetchMessages.onError", this.id, err));
            logger.info("EmailAccount.fetchMessages", this.id, `${results.length} messages`);
        });
    }
    /**
     * Download the specified message and load the related Email Action.
     * @param rawMessage The unprocessed, raw message
     */
    downloadMessage(rawMessage) {
        let parserCallback = async (err, parsedMessage) => {
            if (err) {
                return logger.error("EmailAccount.downloadMessage", this.id, err);
            }
            try {
                if (!this.messageIds[parsedMessage.messageId] && parsedMessage) {
                    await this.processMessage(parsedMessage);
                }
            }
            catch (ex) {
                return logger.error("EmailAccount.downloadMessage", ex.message, ex.stack);
            }
        };
        // Get message attributes and body chunks, and on end proccess the message.
        rawMessage.on("body", stream => mailparser.simpleParser(stream, parserCallback));
    }
    /**
     * Process the specified message against the rules defined on the settings.
     * @param message The downloaded email message
     */
    async processMessage(message) {
        let emailActionRecord;
        for (let rule of settings.email.rules) {
            let valid = message.from.value && message.from.value.length > 0 && message.from.value[0].address;
            if (!valid) {
                logger.warn("EmailAccount.processMessage", this.id, "No valid 'from' address.");
                return;
            }
            let from = message.from.value[0].address.toLowerCase();
            // Check if email comes from the specified sender.
            if (rule.from && rule.from.toLowerCase() != from) {
                valid = false;
            }
            // Check if email subject contains the specified string.
            if (rule.subject && !message.subject.toLowerCase().includes(rule.subject.toLowerCase())) {
                valid = false;
            }
            // Check if email body contains the specified string.
            if (rule.body && !message.text.includes(rule.body)) {
                valid = false;
            }
            if (valid) {
                if (emailActionRecord == null) {
                    emailActionRecord = {
                        id: message.messageId,
                        from: message.from,
                        subject: message.subject,
                        timestamp: moment(),
                        actions: []
                    };
                }
                // Add action to cached message.
                emailActionRecord.actions.push(rule.action);
                // Action!
                try {
                    require("./email-actions/" + rule.action)(message);
                }
                catch (ex) {
                    logger.error("EmailAccount.processMessage", this.id, `Action ${rule.action}`, message.subject, ex);
                }
            }
        }
        // Add to database in case email had any action.
        if (emailActionRecord != null) {
            database.insert("emails-actions", emailActionRecord);
        }
    }
}
module.exports = EmailAccount;

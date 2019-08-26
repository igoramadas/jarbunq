// EmailAccount

import EventEmitter = require("eventemitter3")

const _ = require("lodash")
const imap = require("imap")
const mailparser = require("mailparser")
const moment = require("moment")
const logger = require("anyhow")
let settings

/**
 * Represents a single IMAP mail account.
 */
class EmailAccount {
    /** Default EmailAccount constructor. */
    constructor(id: string, config: any) {
        settings = require("setmeup").settings
        this.id = id
        this.config = config

        logger.info("EmailAccount", id, config.host)
    }

    // PROPERTIES
    // --------------------------------------------------------------------------

    /** Event emitter. */
    events: EventEmitter = new EventEmitter()

    /** ID of this email account. */
    id: string

    /** IMAP account configuration. */
    config: any

    /** IMAP connection client. */
    client: any

    /** Cache of email message IDs. */
    messageIds: any

    // EVENTS
    // --------------------------------------------------------------------------

    /**
     * Bind callback to event. Shortcut to `events.on()`.
     * @param eventName The name of the event.
     * @param callback Callback function.
     */
    on(eventName: string, callback: EventEmitter.ListenerFn): void {
        this.events.on(eventName, callback)
    }

    /**
     * Bind callback to event that will be triggered only once. Shortcut to `events.once()`.
     * @param eventName The name of the event.
     * @param callback Callback function.
     */
    once(eventName: string, callback: EventEmitter.ListenerFn): void {
        this.events.on(eventName, callback)
    }

    /**
     * Unbind callback from event. Shortcut to `events.off()`.
     * @param eventName The name of the event.
     * @param callback Callback function.
     */
    off(eventName: string, callback: EventEmitter.ListenerFn): void {
        this.events.off(eventName, callback)
    }

    // MAIN METHODS
    // --------------------------------------------------------------------------

    /**
     * Start parsing relevant messages on the mail server.
     * @event start
     */
    start(): void {
        this.messageIds = {}

        this.client = new imap(this.config)
        this.openBox(true)

        this.events.emit("start")
    }

    /**
     * Stops parsing messages on the mail server.
     * @event stop
     */
    stop(): void {
        try {
            this.client.closeBox()
            this.client.end()
            this.client = null
        } catch (ex) {
            logger.error("EmailAccount.stop", this.id, ex)
        }

        this.events.emit("stop")
    }

    // METHODS
    // --------------------------------------------------------------------------

    /**
     * Opens the mailbox.
     * @param retry When true it will retry opening the mailbox if failed.
     */
    openBox(retry: boolean): void {
        if (this.client && this.client.state == "authenticated") {
            return logger.warn("EmailAccount.openBox", this.id, "Already connected. Abort.")
        }

        // Once IMAP is ready, open the inbox and start listening to messages.
        this.client.once("ready", () => {
            this.client.openBox(this.config.inboxName, false, err => {
                if (err) {
                    logger.warn("EmailAccount.openBox", this.id, err)

                    // Auth failed? Do not try again.
                    if (err.textCode == "AUTHORIZATIONFAILED") {
                        return logger.error("EmailAccount.openBox", this.id, "Auth failed, please check user and password")
                    }

                    // Retry connection?
                    if (retry) {
                        return _.delay(this.openBox, settings.email.retryInterval, false)
                    }

                    return logger.error("EmailAccount.openBox", this.id, "Failed to connect")
                } else {
                    logger.info("EmailAccount.openBox", this.id, "Inbox ready")

                    // Start fetching unseen messages immediately.
                    const since = moment()
                        .subtract(settings.email.fetchHours, "hours")
                        .toDate()
                    this.fetchMessages(since)
                    this.client.on("mail", () => this.fetchMessages())
                }
            })
        })

        // Handle IMAP errors. If disconnected because of connection reset, call openBox again.
        this.client.on("error", err => {
            logger.error("EmailAccount.openBox.onError", this.id, err)

            if (err.code == "ECONNRESET") {
                return _.delay(this.openBox, settings.imap.retryInterval, true)
            }
        })

        // Connect to the IMAP server.
        return this.client.connect()
    }

    /**
     * Fetch new unread messages for the specified account.
     * @param since Optional date, if not specified will fetch new / unseen messages.
     */
    fetchMessages(since?: Date): void {
        let query = since ? ["SINCE", since] : "UNSEEN"

        return this.client.search([query], (err, results) => {
            if (err) {
                return logger.error("EmailAccount.fetchMessages", this.id, err)
            }

            if (results == null || results.length < 1) {
                return logger.info("EmailAccount.fetchMessages", this.id, "No new messages")
            }

            const fetcher = this.client.fetch(results, {size: true, struct: true, markSeen: false, bodies: ""})
            fetcher.on("message", msg => this.downloadMessage(msg))
            fetcher.once("error", err => logger.error("EmailAccount.fetchMessages.onError", this.id, err))

            logger.info("EmailAccount.fetchMessages", this.id, `${results.length} messages`)
        })
    }

    /**
     * Download the specified message and load the related Email Action.
     * @param msg
     */
    downloadMessage(rawMessage): void {
        let parserCallback = async (err, parsedMessage) => {
            if (err) {
                return logger.error("EmailAccount.downloadMessage", this.id, err)
            }

            try {
                if (!this.messageIds[parsedMessage.messageId] && parsedMessage) {
                    await this.processMessage(parsedMessage)
                }
            } catch (ex) {
                return logger.error("EmailAccount.downloadMessage", ex.message, ex.stack)
            }
        }

        // Get message attributes and body chunks, and on end proccess the message.
        rawMessage.on("body", stream => mailparser.simpleParser(stream, parserCallback))
    }

    async processMessage(message: any): Promise<void> {
        for (let rule of settings.email.rules) {
            let valid = message.from.value && message.from.value.length > 0 && message.from.value[0].address

            if (!valid) {
                logger.warn("EmailAccount.processMessage", this.id, "No valid 'from' address.")
                return
            }

            let from = message.from.value[0].address.toLowerCase()

            if (rule.from && rule.from.toLowerCase() != from) {
                valid = false
            }

            if (message.subject && !rule.subject.toLowerCase().includes(rule.subject.toLowerCase())) {
                valid = false
            }

            if (valid) {
                this.messageIds[message.messageId] = message

                try {
                    require("./email-actions/" + rule.action)(message)
                } catch (ex) {
                    logger.error("EmailAccount.processMessage", this.id, `Action ${rule.action}`, message.messageId, message.subject, ex)
                }
            }
        }
    }
}

// Exports...
export = EmailAccount

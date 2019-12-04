// EmailAccount

import _ = require("lodash")
import bunq = require("./bunq")
import database = require("./database")
import imap = require("imap")
import mailparser = require("mailparser")
import moment = require("moment")
import logger = require("anyhow")
const settings = require("setmeup").settings

/**
 * Represents a single IMAP mail account.
 */
class EmailAccount extends require("./base-events") {
    /** Default EmailAccount constructor. */
    constructor(id: string, config: any) {
        super()

        this.id = id
        this.config = config
        this.config.autoTLS = settings.email.autoTLS

        logger.info("EmailAccount", id, config.host, config.port)
    }

    // PROPERTIES
    // --------------------------------------------------------------------------

    /** ID of this email account. */
    id: string

    /** IMAP account configuration. */
    config: any

    /** IMAP connection client. */
    client: any

    /** Cache of email message IDs. */
    messageIds: any

    /** Timestamp of last fetch. */
    lastFetch: number

    /** Retry count. */
    retryCount: number = 0

    // CONTROL METHODS
    // --------------------------------------------------------------------------

    /**
     * Connect and sart parsing relevant messages on the mail server.
     * @event start
     */
    start = (): void => {
        this.lastFetch = 0
        this.messageIds = {}
        this.connect()

        this.events.emit("start")
    }

    /**
     * Stops parsing messages on the mail server.
     * @event stop
     */
    stop = (): void => {
        this.unbind()

        try {
            this.client.closeBox()
            this.client.end()
            this.client = null
        } catch (ex) {
            logger.error("EmailAccount.stop", this.id, ex)
        }

        this.events.emit("stop")
    }

    // CLIENT EVENTS
    // --------------------------------------------------------------------------

    /**
     * Stop listening to events triggered by the IMAP client.
     */
    private unbind = (): void => {
        try {
            this.client.off("mail", this.onMail)
            this.client.off("error", this.onError)
            this.client.off("ready", this.onReady)
            this.client.off("end", this.onEnd)
        } catch (ex) {
            logger.error("EmailAccount.unbind", this.id, ex)
        }
    }

    /**
     * When the IMAP client has connected and ready to open the email box.
     * @event ready
     */
    private onReady = () => {
        logger.debug("EmailAccount.onRead")

        this.client.openBox(this.config.inboxName, false, (err) => {
            if (err) {
                this.retryCount++

                // Auth failed? Do not try again.
                if (err.textCode == "AUTHORIZATIONFAILED") {
                    return logger.error("EmailAccount.onReady", this.id, "Auth failed, please check user and password")
                }

                // Too many retries? Stop now.
                if (this.retryCount > settings.email.maxRetry) {
                    return logger.error("EmailAccount.onReady", this.id, `Failed to connect ${this.retryCount} times, abort`)
                }

                // Try again after some seconds.
                logger.warn("EmailAccount.onReady", this.id, err, "Will retry...")
                return _.delay(this.connect, settings.email.retryInterval)
            }

            // Reset retry count.
            this.retryCount = 0
            logger.info("EmailAccount.onReady", this.id, "Inbox ready")

            // Start fetching unseen messages immediately.
            const since = moment().subtract(settings.email.fetchHours, "hours")
            this.fetchMessages(since.toDate())

            if (this.lastFetch > 0) {
                this.client.off("mail", this.onMail)
            }

            this.client.on("mail", this.onMail)
            this.events.emit("ready")
        })
    }

    /**
     * When errors are triggered on the IMAP client.
     * @event error
     */
    private onError = (err: any) => {
        logger.error("EmailAccount.onError", this.id, err)

        if (err.code == "ECONNRESET" || err.code == "EAI_AGAIN") {
            _.delay(this.connect, settings.email.retryInterval)
        }

        this.events.emit("error", err)
    }

    /**
     * When new email arrives on the box. Will make a call to `fetchMessages()`.
     */
    private onMail = (count?: number) => {
        logger.debug("EmailAccount.onMail", count)
        this.fetchMessages()
    }

    /**
     * When the IMAP client connection has ended, set a timer to reconnect.
     */
    private onEnd = () => {
        logger.info("EmailAccount.end", this.id, "Connection closed")
        _.delay(this.connect, settings.email.retryInterval)
    }

    // MAIN METHODS
    // --------------------------------------------------------------------------

    /**
     * Opens the mailbox.
     * @param retry When true it will retry opening the mailbox if failed.
     */
    connect = () => {
        if (this.client) {
            if (this.client.state == "authenticated") {
                return logger.warn("EmailAccount.connect", this.id, "Already connected")
            } else {
                this.unbind()
            }
        }

        // Force create a new client object.
        this.client = new imap(this.config)

        // Bind events.
        this.client.on("error", this.onError)
        this.client.once("ready", this.onReady)
        this.client.once("end", this.onEnd)

        // Connect to the IMAP server.
        try {
            return this.client.connect()
        } catch (ex) {
            logger.error("EmailAccount.connect", ex)
        }
    }

    /**
     * Fetch new unread messages for the specified account.
     * @param since Optional date, if not specified will fetch new / unseen messages.
     */
    fetchMessages = (since?: Date): void => {
        let query = since ? ["SINCE", since] : "UNSEEN"

        this.client.search([query], (err, results) => {
            if (err) {
                return logger.error("EmailAccount.fetchMessages", this.id, err)
            }

            if (results == null || results.length < 1) {
                return logger.info("EmailAccount.fetchMessages", this.id, "No new messages")
            }

            const fetcher = this.client.fetch(results, {size: true, struct: true, markSeen: false, bodies: ""})
            fetcher.on("message", (msg) => this.downloadMessage(msg))
            fetcher.once("error", (err) => logger.error("EmailAccount.fetchMessages.onError", this.id, err))

            // Log and set last fetch timestamp.
            logger.info("EmailAccount.fetchMessages", this.id, `${results.length} message(s)`)
            this.lastFetch = moment().unix()
        })
    }

    /**
     * Download the specified message and load the related Email Action.
     * @param rawMessage The unprocessed, raw message
     */
    downloadMessage = (rawMessage: any): void => {
        let uid

        let parserCallback = async (err, parsedMessage) => {
            if (err) {
                return logger.error("EmailAccount.downloadMessage", this.id, err)
            }

            try {
                // We don't need the brackets on the message ID.
                parsedMessage.uid = uid
                parsedMessage.messageId = parsedMessage.messageId.replace(/\</g, "").replace(/\>/g, "")

                logger.debug("EmailAccount.downloadMessage", parsedMessage.messageId, parsedMessage.from, parsedMessage.subject, `To ${parsedMessage.to}`)

                // Only process message if we haven't done it before (in case message goes back to inbox).
                if (!this.messageIds[parsedMessage.messageId] && parsedMessage) {
                    this.messageIds[parsedMessage.messageId] = moment()
                    await this.processEmail(parsedMessage)
                }
            } catch (ex) {
                return logger.error("EmailAccount.downloadMessage", ex.message, ex.stack)
            }
        }

        // Get message attributes and body chunks, and on end proccess the message.
        rawMessage.once("attributes", (attrs) => {
            uid = attrs.uid
        })
        rawMessage.on("body", (stream) => mailparser.simpleParser(stream, parserCallback))
    }

    /**
     * Process the specified message against the rules defined on the settings.
     * @param message The downloaded email message
     * @event processEmail
     */
    processEmail = async (message: any): Promise<void> => {
        logger.debug("EmailAccount.processEmail", message.messageId, message.from, message.subject, `To ${message.to}`)

        let processedEmail: ProcessedEmail = null
        let from = null

        try {
            from = message.from.value[0].address.toLowerCase()

            // Check if message was already processed.
            const findExisting = database.get("processedEmails").find({messageId: message.messageId})
            const existingMessage = findExisting.value()

            if (existingMessage != null) {
                return logger.warn("EmailAccount.processEmail", message.messageId, from, message.subject, `Skip, was already processed at ${existingMessage.date}`)
            }
        } catch (ex) {
            logger.error("EmailAccount.processEmail", this.id, message.messageId, ex)
        }

        // Iterate rules.
        for (let r of settings.email.rules) {
            let rule = r as EmailActionRule
            let actionModule

            try {
                actionModule = require("./email-actions/" + rule.action)

                // Get default rule from action.
                if (actionModule.defaultRule != null) {
                    rule = _.defaultsDeep(rule, actionModule.defaultRule)
                }
            } catch (ex) {
                logger.error("EmailAccount.processEmail", this.id, `Action ${rule.action}`, message.messageId, ex)
                continue
            }

            // At least one property must be defined on the rule.
            let valid = message.from || message.subject || message.body

            if (!valid) {
                logger.error("EmailAccount.processEmail", this.id, `Action ${rule.action}`, message.messageId, "Rule must have at least a from, subject or body specified")
                continue
            }

            // Make sure rule definitions are arrays.
            for (const field of ["from", "subject", "body"]) {
                if (rule[field] != null && _.isString(rule[field])) {
                    rule[field] = [rule[field]]
                }
            }

            // Check if email comes from one of the specified senders.
            if (rule.from) {
                valid = false

                for (const value of rule.from) {
                    if (from.indexOf(value) >= 0) {
                        valid = true
                    }
                }
                if (!valid) {
                    continue
                }
            }

            // Check if email subject contains a specified string.
            if (rule.subject) {
                valid = false

                for (const value of rule.subject) {
                    if (message.subject.toLowerCase().indexOf(value.toLowerCase()) >= 0) {
                        valid = true
                    }
                }
                if (!valid) {
                    continue
                }
            }

            // Check if email body contains a specified string.
            if (rule.body) {
                valid = false

                for (const value of rule.body) {
                    if (message.text.indexOf(value) >= 0) {
                        valid = true
                    }
                }
                if (!valid) {
                    continue
                }
            }

            // Extra validation on incoming messages. Must have
            // at least 4 out of 7 possible security features.
            if (settings.email.checkSecurity && !this.validateEmail(message, rule)) {
                logger.error("EmailAccount", this.id, message.messageId, message.subject, "Message did not pass the security checks")
                return
            }

            if (processedEmail == null) {
                processedEmail = {
                    messageId: message.messageId,
                    from: from,
                    subject: message.subject,
                    date: moment().toDate(),
                    actions: {}
                }
            }

            // Information to be logged about the current rule.
            let logRule = []
            for (let [key, value] of Object.entries(rule)) {
                if (_.isArray(value)) {
                    logRule.push(`${key}=${(value as any).join(" ")}`)
                } else {
                    logRule.push(`${key}=${value}`)
                }
            }

            // Action!
            try {
                const actionResult = await actionModule(message, rule)

                // Action was not processed?
                if (actionResult == null) {
                    processedEmail.actions[rule.action] = false
                    logger.info("EmailAccount.processEmail", this.id, logRule.join(", "), message.messageId, message.subject, "Result null")
                    continue
                }

                const resultError = actionResult.error

                // Action returned an error? Log and stop.
                if (resultError) {
                    processedEmail.actions[rule.action] = resultError
                    logger.error("EmailAccount.processEmail", this.id, logRule.join(", "), message.messageId, message.subject, resultError)
                    continue
                }

                // Action returned payment options? Add default notes and proceed with payment.
                if (actionResult.amount && actionResult.toAlias && actionResult.description) {
                    if (!actionResult.notes) {
                        actionResult.notes = []
                    }

                    actionResult.notes.unshift(message.subject)
                    actionResult.notes.unshift(`Email action: ${rule.action}`)
                    actionResult.reference = `${rule.action}-${message.messageId}`

                    // Pay!
                    const payment = await bunq.makePayment(actionResult)
                    logger.info("EmailAccount.processEmail", this.id, logRule.join(", "), message.messageId, message.subject, `Payment ID: ${payment.id}`)
                } else if (_.isString(actionResult)) {
                    logger.info("EmailAccount.processEmail", this.id, logRule.join(", "), message.messageId, message.subject, actionResult)
                } else {
                    logger.info("EmailAccount.processEmail", this.id, logRule.join(", "), message.messageId, message.subject, "Processed")
                }

                processedEmail.actions[rule.action] = true
            } catch (ex) {
                logger.error("EmailAccount.processEmail", this.id, logRule.join(", "), message.messageId, message.subject, ex)
                processedEmail.actions[rule.action] = ex.toString()
            }
        }

        // Add to database in case email had any action.
        if (processedEmail != null) {
            database.insert("processedEmails", processedEmail)
            this.events.emit("processEmail", processedEmail)

            // Mark message as read?
            if (settings.email.markAsRead && message.uid) {
                this.client.addFlags(message.uid, "SEEN", (err) => {
                    if (err) {
                        logger.error("EmailAccount.processEmail", "markAsRead", message.messageId, message.subject, err)
                    }
                })
            }
        }
    }

    /**
     * Check email headers for security features.
     */
    private validateEmail = (message, rule): boolean => {
        let securityCount = 0

        if (message.headers.has("received-spf") && message.headers.get("received-spf").includes("pass")) {
            securityCount++
        }

        // Check for authentication results header, or via ARC.
        if (message.headers.has("authentication-results")) {
            const authResults = message.headers.get("authentication-results")
            if (authResults.includes("spf=pass")) {
                securityCount++
            }
            if (authResults.includes("dkim=pass")) {
                securityCount++
            }
        } else if (message.headers.has("arc-authentication-results")) {
            const arcAuthResults = message.headers.get("arc-authentication-results")
            if (arcAuthResults.includes("spf=pass")) {
                securityCount++
            }
            if (arcAuthResults.includes("dkim=pass")) {
                securityCount++
            }
        }

        // Check for ARC seal.
        if (message.headers.has("arc-seal")) {
            securityCount++
        }

        // Check for security scan.
        if (message.headers.has("x-cloud-security-sender") && rule.from.indexOf(message.headers.get("x-cloud-security-sender")) > 0) {
            securityCount++
        }

        // At least 3 security features required.
        return securityCount >= 3
    }
}

// Exports...
export = EmailAccount

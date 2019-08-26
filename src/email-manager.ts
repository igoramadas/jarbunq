// EmailManager

import EventEmitter = require("eventemitter3")
import EmailAccount = require("./email-account")

const logger = require("anyhow")
const settings = require("setmeup").settings

/**
 * Manages email accounts, defined as [[EmailAccount]].
 */
class EmailManager {
    private static _instance: EmailManager
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    // PROPERTIES
    // --------------------------------------------------------------------------

    /** Event emitter. */
    events: EventEmitter = new EventEmitter()

    /** Email accounts. */
    accounts: EmailAccount[] = []

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
            return logger.warn("EmailManager.start", `Already started with ${this.accounts.length} accounts. Abort.`)
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

        this.events.emit("start")
    }

    /**
     * Stops parsing messages on the mail server.
     * @event stop
     */
    stop = () => {
        for (let account of this.accounts) {
            account.stop()
        }

        this.accounts = []
        this.events.emit("stop")
    }
}

// Exports...
export = EmailManager.Instance

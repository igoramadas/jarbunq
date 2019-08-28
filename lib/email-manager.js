"use strict";
// EmailManager
const BaseEvents = require("./base-events");
const EmailAccount = require("./email-account");
const logger = require("anyhow");
const settings = require("setmeup").settings;
/**
 * Manages email accounts, defined as [[EmailAccount]].
 */
class EmailManager extends BaseEvents {
    constructor() {
        super(...arguments);
        // PROPERTIES
        // --------------------------------------------------------------------------
        /** Email accounts. */
        this.accounts = [];
        /**
         * Start parsing relevant messages on the mail server.
         * @event start
         */
        this.start = () => {
            if (this.accounts.length > 0) {
                return logger.warn("EmailManager.start", `Already started with ${this.accounts.length} accounts. Abort.`);
            }
            this.accounts = [];
            const keys = Object.keys(settings.email.accounts);
            logger.info("EmailManager.start", `Will start ${keys.length} account(s)`);
            // Start emaikl accounts.
            for (let id of keys) {
                const account = new EmailAccount(id, settings.email.accounts[id]);
                this.accounts.push(account);
                account.start();
            }
            // No accounts found? Log an alert.
            if (this.accounts.length == 0) {
                logger.warn("EmailManager.start", "No accounts found. Please make sure you have accounts set via settings.email.accounts.");
            }
            this.events.emit("start");
        };
        /**
         * Stops parsing messages on the mail server.
         * @event stop
         */
        this.stop = () => {
            for (let account of this.accounts) {
                account.stop();
            }
            this.accounts = [];
            this.events.emit("stop");
        };
    }
    static get Instance() {
        return this._instance || (this._instance = new this());
    }
    // MAIN METHODS
    // --------------------------------------------------------------------------
    /**
     * Init the email accounts.
     */
    async init() {
        this.start();
    }
}
module.exports = EmailManager.Instance;

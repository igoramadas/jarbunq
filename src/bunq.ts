// Bunq

import EventEmitter = require("eventemitter3")
import BunqJSClient from "@bunq-community/bunq-js-client"

const _ = require("lodash")
const crypto = require("crypto")
const database = require("./database")
const logger = require("anyhow")
const moment = require("moment")
const settings = require("setmeup").settings
let bunqClient

/**
 * This is a wrapper over bunq-js-client, and should have all the business
 * logic to handle notifications and transactions at bunq.
 */
class Bunq {
    private static _instance: Bunq
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    // PROPERTIES
    // --------------------------------------------------------------------------

    /** The authentication URL used to start the OAuth2 flow. */
    get authenticated(): boolean {
        return database.get("accessToken").value() != null
    }

    /** The authentication URL used to start the OAuth2 flow. */
    get authUrl(): string {
        const redirect = settings.app.url + "auth/callback"
        return bunqClient.formatOAuthAuthorizationRequestUrl(settings.bunq.api.clientId, redirect, false, false)
    }

    /** Event emitter. */
    events: EventEmitter = new EventEmitter()

    /** The main user data. */
    user: any

    /** List of bank accounts. */
    accounts: any[]

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

    // SETUP AND AUTH
    // --------------------------------------------------------------------------

    /**
     * Create the bunq-js-client and load initial data.
     */
    async init() {
        // Make sure settings are defined.
        if (!settings.bunq.api.key) {
            throw new Error("No API key define on settings.bunq.api.key.")
        }
        if (!settings.bunq.api.cryptoKey) {
            throw new Error("No encryption key define on settings.bunq.api.cryptoKey.")
        }
        if (!settings.bunq.api.clientId || !settings.bunq.api.clientSecret) {
            throw new Error("Missing a valid settings.bunq.api.clientId and settings.bunq.api.clientSecret combination.")
        }

        // Create bunq JS client.
        try {
            const store = {
                get: (key: string) => database.get(`jsclient.${key}`).value(),
                set: (key: string, value: any) => database.set(`jsclient.${key}`, value).write(),
                remove: (key: string) => database.unset(`jsclient.${key}`).write()
            }

            bunqClient = new BunqJSClient(store)
            bunqClient.setKeepAlive(false)
        } catch (ex) {
            logger.error("Bunq", "Constructor", ex)
        }

        // Setup client.
        try {
            await bunqClient.run(settings.bunq.api.key, settings.bunq.api.ips, settings.bunq.api.environment, settings.bunq.api.cryptoKey)
            await bunqClient.install()
        } catch (ex) {
            logger.error("Bunq.init", "Error installing", ex)
            return process.exit()
        }

        // Register device and session.
        try {
            await bunqClient.registerDevice(settings.app.title)
            await bunqClient.registerSession()
        } catch (ex) {
            logger.error("Bunq.init", "Error registering device session", ex)
            return process.exit()
        }

        logger.info("Bunq.init", settings.bunq.api.environment, `Registered as ${settings.app.title}`)

        // Check if user authenticated before, and if so, load initial information.
        try {
            if (!this.authenticated) {
                logger.warn("Bunq.init", "Not authorized yet!", `Please open ${settings.app.url + "auth"} on your browser`)
            } else {
                await this.refreshUserData()
            }
        } catch (ex) {
            logger.error("Bunq.init", "Can't load initial data", ex)
            return process.exit()
        }
    }

    /**
     * Get the OAuth2 access token based on the provided authorization code.
     * This method will return null when it fails to get the token.
     * @param code The authorization code provided via the /auth URL.
     */
    getOAuthToken = async (code: string) => {
        const redirect = settings.app.url + "auth/callback"

        try {
            const token = await bunqClient.exchangeOAuthToken(settings.bunq.api.clientId, settings.bunq.api.clientSecret, redirect, code, false, false, "authorization_code")
            database.set("accessToken", token).write()

            logger.info("Bunq.getOAuthToken", "Got a new access token")
            return true
        } catch (ex) {
            logger.error("Bunq.getOAuthToken", ex)
            return false
        }
    }

    // MAIN METHODS
    // --------------------------------------------------------------------------

    /**
     * Load user info and its main accounts.
     */
    refreshUserData = async () => {
        try {
            await this.getUser()
            await this.getAccounts()
        } catch (ex) {
            logger.error("Bunq.refreshUserData", ex)
            throw ex
        }
    }

    /**
     * Get the main user account.
     */
    getUser = async () => {
        try {
            const users = await bunqClient.getUsers(true)
            this.user = users[Object.keys(users)[0]]

            logger.info("Bunq.getUser", `ID ${this.user.id}`, this.user.public_nick_name)
        } catch (ex) {
            logger.error("Bunq.getUser", ex)
            throw ex
        }
    }

    /**
     * Get all the relevant accounts for the user.
     */
    getAccounts = async () => {
        try {
            const accounts = await bunqClient.api.monetaryAccount.list(this.user.id)

            // Fail if no accounts were returned for the current user.
            if (accounts.length == 0) {
                throw new Error("Got 0 accounts, expected at least 1")
            }

            this.accounts = []

            // Iterate and populate account list. This will also append
            // a "type" to the account properties.
            for (let acc of accounts) {
                let firstKey = Object.keys(acc)[0]
                acc[firstKey].type = firstKey.replace("MonetaryAccount", "")
                this.accounts.push(acc[firstKey])
            }

            logger.info("Bunq.getAccounts", `Got ${accounts.length} accounts`, _.map(this.accounts, "description").join(", "))
        } catch (ex) {
            logger.error("Bunq.getAccounts", ex)
            throw ex
        }
    }

    /**
     * Make a payment to another account.
     */
    makePayment = async (options: PaymentOptions) => {
        try {
            const alias: any = {value: options.toAlias}
            let accountId, paymentMethod

            // Basic payment validation.
            if (options.amount <= 0) {
                return new Error("Payments must have an amount greater than 0.")
            }

            // Check if amount is under the maximum allowed.
            if (options.amount > settings.bunq.maxPaymentAmount) {
                return new Error(`Payment amount ${options.amount} is over the maximum allowed ${settings.bunq.maxPaymentAmount}.`)
            }

            // Use default account ID?
            if (!options.fromAccount) {
                options.fromAccount = settings.bunq.accounts.main
            }

            // From account is an alias or an actual ID?
            if (_.isNumber(options.fromAccount)) {
                accountId = options.fromAccount
            } else {
                const acc = _.find(this.accounts, a => {
                    return _.find(a.alias, {value: options.fromAccount}) != null
                })
                accountId = acc.id
            }

            let refAccount = _.find(this.accounts, {id: accountId})

            // Make sure we have funds available.
            if (refAccount.balance.value - (options.amount as number) < settings.bunq.minBalance) {
                throw new Error(`Payment would cause balance to go under the minimum of ${settings.bunq.minBalance}.`)
            }

            // Set alias to email, phone or IBAN depending on its value.
            if (options.toAlias.indexOf("@") > 0) {
                alias.type = "EMAIL"
            } else if (options.toAlias.length < 15) {
                alias.type = "PHONE_NUMBER"
            } else {
                alias.type = "IBAN"
            }

            // Currency defaults to EUR.
            if (!options.currency) {
                options.currency = "EUR"
            }

            // Is it a draft or regular payment?
            if (options.draft) {
                paymentMethod = bunqClient.api.draftPayment.post
            } else {
                paymentMethod = bunqClient.api.payment.post
            }

            // Create a payment reference, if none was specified.
            if (!options.reference) {
                options.reference = moment().format("YYYYMMDD") + "-" + options.amount + "-" + options.description
            }

            // Make hash from reference.
            const hash = crypto.createHash("sha1")
            options.hash = hash.update(options.reference).digest("hex")

            // Make sure payment was not made before.
            const existingPayment = database.get("payments").find({hash: options.hash})
            if (existingPayment.value()) {
                throw new Error(`Duplicate payment: ${options.reference}`)
            }

            // Logging info.
            const logDraft = options.draft ? "Draft" : "Regular payment"
            const logAccount = _.find(this.accounts, {id: accountId}).description

            let payment

            // Check if payments are disable. If so, log instead, otherwise proceed.
            if (settings.bunq.disablePayments) {
                payment = {disabled: true}
                logger.warn("Bunq.makePayment", `${logDraft} DISABLED`, `${options.amount} ${options.currency} from ${logAccount} to ${options.toAlias}`, options.description)
            } else {
                payment = await paymentMethod(
                    this.user.id,
                    accountId,
                    options.description,
                    {
                        value: options.amount.toString(),
                        currency: options.currency
                    },
                    alias
                )

                // Save payment record to database, which is a copy of
                // the payment options but with a date added.
                const paymentRecord = _.cloneDeep(options)
                paymentRecord.date = moment().toDate()
                database.insert("payments", paymentRecord)

                logger.info("Bunq.makePayment", logDraft, `${options.amount} ${options.currency} from ${logAccount} to ${options.toAlias}`, options.description)
            }

            return payment
        } catch (ex) {
            logger.error("Bunq.makePayment", ex)
            throw ex
        }
    }
}

/**
 * Defines payment options.
 */
interface PaymentOptions {
    /** The source account. */
    fromAccount?: number | string
    /** Target account alias can be an email, phone or IBAN. */
    toAlias: string
    /** Payment description, only valid ASCII characters. */
    description: string
    /** Payment amount. */
    amount: number | string
    /** Payment currency, default is EUR. */
    currency?: string
    /** Set to true to make a draft payment (request) instead of regular (automatic). */
    draft?: boolean
    /** A unique reference to the payment, to avoid duplicates. */
    reference?: string
    /** The hash generated based on reference or payment data. */
    hash?: string
}

// Exports...
export = Bunq.Instance

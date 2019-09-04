// Bunq

import BaseEvents = require("./base-events")
import BunqJSClient from "@bunq-community/bunq-js-client"

const _ = require("lodash")
const crypto = require("crypto")
const database = require("./database")
const logger = require("anyhow")
const moment = require("moment")
const notifications = require("./notifications")
const settings = require("setmeup").settings
let bunqClient, lastAuthWarning

/**
 * This is a wrapper over bunq-js-client, and should have all the business
 * logic to handle notifications and transactions at bunq.
 */
class Bunq extends BaseEvents {
    private static _instance: Bunq
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    // PROPERTIES
    // --------------------------------------------------------------------------

    /** The authentication URL used to start the OAuth2 flow. */
    get authenticated(): boolean {
        const result = database.get("bunqTokenDate").value() != null

        if (!result && lastAuthWarning.isBefore(moment().subtract(5, "minutes"))) {
            lastAuthWarning = moment()
            console.warn(`
---------------------------------------------------------------
Please open ${settings.app.url + "login"} on your browser
---------------------------------------------------------------
`)
        }

        return result
    }

    /** The authentication URL used to start the OAuth2 flow. */
    get authUrl(): string {
        const redirect = settings.app.url + "auth/callback"
        return bunqClient.formatOAuthAuthorizationRequestUrl(settings.bunq.api.clientId, redirect, false, false)
    }

    /** The main user data. */
    user: any

    /** List of bank accounts. */
    accounts: any[]

    /** Timer to auto refresh user data and accounts. */
    timerRefresh: any

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

        lastAuthWarning = moment("2000-01-01")

        // Create bunq JS client.
        try {
            const store = {
                get: (key: string) => database.get(`jsClient.${key}`).value(),
                set: (key: string, value: any) => database.set(`jsClient.${key}`, value).write(),
                remove: (key: string) => database.unset(`jsClient.${key}`).write()
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

        logger.info("Bunq.init", settings.bunq.api.environment, `Registered as '${settings.app.title}'`)

        // Check if user authenticated before, and if so, load initial information.
        try {
            if (!this.authenticated) {
                logger.warn("Bunq.init", "Not authorized yet")
            } else {
                await this.refreshUserData()
                this.timerRefresh = setInterval(this.refreshUserData, settings.bunq.refreshMinutes)
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

            if (!token) {
                throw new Error("Invalid access token")
            }

            // Save current date to database.
            const now = new Date()
            database.set("bunqTokenDate", now.toString()).write()

            logger.info("Bunq.getOAuthToken", "Got a new access token")
            return true
        } catch (ex) {
            logger.error("Bunq.getOAuthToken", ex)
            return false
        }
    }

    /**
     * Helper to process and take action on errors from the bunq API.
     */
    processBunqError(ex: Error) {
        return ex
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
            if (!this.authenticated) {
                throw new Error("Not authenticated to bunq")
            }

            const users = await bunqClient.getUsers(true)
            this.user = users[Object.keys(users)[0]]

            // Owner setting from public nickname.
            if (settings.app.owner == null) {
                settings.app.owner = this.user.public_nick_name
            }

            logger.info("Bunq.getUser", `ID ${this.user.id}`, this.user.public_nick_name)
        } catch (ex) {
            this.processBunqError(ex)
            logger.error("Bunq.getUser", ex)
            throw ex
        }
    }

    /**
     * Get all the relevant accounts for the user.
     */
    getAccounts = async () => {
        try {
            if (!this.authenticated) {
                throw new Error("Not authenticated to bunq")
            }

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
            this.processBunqError(ex)
            logger.error("Bunq.getAccounts", ex)
            throw ex
        }
    }

    /**
     * Get the current account balance for the specified alias.
     * @param alias The email, phone or IBAN of the account.
     * @event makePayment
     */
    getAccountBalance = async (alias: string) => {
        try {
            if (!this.authenticated) {
                throw new Error("Not authenticated to bunq")
            }

            await this.getAccounts()

            const acc = _.find(this.accounts, a => {
                return _.find(a.alias, {value: alias}) != null
            })

            if (!acc) {
                throw new Error(`Account ${alias} not found.`)
            }

            return parseFloat(acc.balance.value)
        } catch (ex) {
            logger.error("Bunq.getAccountBalance", alias, ex)
            throw ex
        }
    }

    /**
     * Make a payment to another account.
     * @param options The payment options.
     */
    makePayment = async (options: PaymentOptions) => {
        const alias: any = {value: options.toAlias}
        let accountId, niceAmount

        try {
            if (_.isString(options.amount)) {
                options.amount = parseFloat(options.amount as string)
            }

            niceAmount = (options.amount as number).toFixed(2)

            // Currency defaults to EUR.
            if (options.currency == null) {
                options.currency = "EUR"
            }
            // Get default type of payment (regular or draft) if options.draft was not specified.
            if (options.draft == null) {
                options.draft = settings.bunq.draftPayment
            }

            // Use default account ID?
            if (options.fromAlias == null) {
                options.fromAlias = settings.bunq.accounts.main
            }

            // Create a payment reference, if none was specified. Please note
            // that this is the internal database reference, do not confuse with
            // the payment description (called reference as well by some banks).
            if (!options.reference) {
                options.reference = moment().format("YYYYMMDD") + "-" + niceAmount + "-" + options.description
            }

            if (!this.authenticated) {
                throw new Error("Not authenticated to bunq")
            }

            // Basic payment validation.
            if (options.amount <= 0) {
                return new Error("Payments must have an amount greater than 0.")
            }

            // Check if amount is under the maximum allowed.
            if (options.amount > settings.bunq.maxPaymentAmount) {
                return new Error(`Payment amount ${niceAmount} is over the maximum allowed ${settings.bunq.maxPaymentAmount}.`)
            }

            // From account is an alias or an actual ID?
            if (_.isNumber(options.fromAlias)) {
                accountId = options.fromAlias
            } else {
                const acc = _.find(this.accounts, a => {
                    return _.find(a.alias, {value: options.fromAlias}) != null
                })

                // Account not found?
                if (acc == null) {
                    throw new Error(`Account ${options.fromAlias} not found`)
                }

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

            // Make hash from reference.
            const hash = crypto.createHash("sha1")
            options.hash = hash.update(options.reference).digest("hex")

            // Make sure payment was not made before.
            const existingPayment = database.get("payments").find({hash: options.hash})
            if (existingPayment.value()) {
                throw new Error(`Duplicate payment: ${options.reference}`)
            }
        } catch (ex) {
            this.failedPayment(options, ex, "preparing")
            throw ex
        }

        try {
            const logDraft = options.draft ? "Draft payment" : "Regular payment"
            const logAccount = _.find(this.accounts, {id: accountId}).description
            const logFromTo = `${niceAmount} ${options.currency} from ${logAccount} to ${options.toAlias}`
            let payment

            // Check if payments are disable. If so, log instead, otherwise proceed.
            if (settings.bunq.disablePayments) {
                payment = {disabled: true}
                logger.warn("Bunq.makePayment", `${logDraft} ! DISABLED !`, logFromTo, options.description)
            } else {
                // Is it a draft or regular payment?
                if (options.draft) {
                    payment = await bunqClient.api.draftPayment.post(
                        this.user.id,
                        accountId,
                        options.description,
                        {
                            value: niceAmount,
                            currency: options.currency
                        },
                        alias
                    )
                } else {
                    payment = await bunqClient.api.payment.post(
                        this.user.id,
                        accountId,
                        options.description,
                        {
                            value: options.amount.toString(),
                            currency: options.currency
                        },
                        alias
                    )
                }

                // Save payment record to database, which is a copy of
                // the payment options but with a date added.
                const paymentRecord = _.cloneDeep(options)
                paymentRecord.date = moment().toDate()
                database.insert("payments", paymentRecord)

                this.events.emit("makePayment", paymentRecord)
                logger.info("Bunq.makePayment", logDraft, logFromTo, options.description)
            }

            return payment
        } catch (ex) {
            this.processBunqError(ex)
            this.failedPayment(options, ex, "processing")
            throw ex
        }
    }

    /**
     * Helper private function to handle failed payments.
     * @param options Options for the payment that failed
     * @param err The error or exeception object
     * @param step The payment step (preparing or processing)
     */
    private failedPayment = (options: PaymentOptions, err: Error, step: string) => {
        let amount = (options.amount as number).toFixed(2)
        let errorString = err.toString()

        logger.error("Bunq.failedPayment", `${step} payment`, `${amount} ${options.currency} to ${options.toAlias}`, err)

        // Make sure we have "Error" on the error string.
        if (errorString.indexOf("Error") < 0) {
            errorString = "Error: " + errorString
        }

        const subject = `Payment ${amount} failed to ${options.toAlias}`
        const message = `Payment of ${amount} ${options.currency}
                         from account ${options.fromAlias} to ${options.toAlias} failed.
                         <br>
                         Description: ${options.description}
                         <br><br>
                         ${errorString}`

        // Send notification of failed payment.
        notifications.send({subject: subject, message: message})
    }
}

/**
 * Defines payment options.
 */
interface PaymentOptions {
    /** The source account alias can be an email or phone. */
    fromAlias?: number | string
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

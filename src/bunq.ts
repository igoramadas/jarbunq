// Bunq

import {PaymentOptions, Payment} from "./types"
import BunqJSClient from "@bunq-community/bunq-js-client"
import _ = require("lodash")
import crypto = require("crypto")
import database = require("./database")
import logger = require("anyhow")
import moment = require("moment")
import notifications = require("./notifications")
const settings = require("setmeup").settings
let bunqClient, lastAuthWarning

/**
 * This is a wrapper over bunq-js-client, and should have all the business
 * logic to handle notifications and transactions at bunq.
 */
class Bunq extends require("./base-events") {
    private static _instance: Bunq
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    // PROPERTIES
    // --------------------------------------------------------------------------

    /** The authentication URL used to start the OAuth2 flow. */
    get authenticated(): boolean {
        const result = database.get("bunqTokenDate").value() != null

        if (!result) {
            this.authNeeded()
        }

        return result
    }

    /** The authentication URL used to start the OAuth2 flow. */
    get authUrl(): string {
        const redirect = settings.app.url + "bunq/auth/callback"
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
                this.timerRefresh = setInterval(this.refreshUserData, settings.bunq.refreshMinutes * 1000 * 60)
            }
        } catch (ex) {
            logger.error("Bunq.init", "Can't load initial data", ex)
            return process.exit()
        }
    }

    /**
     * Get the OAuth2 access token based on the provided authorization code.
     * This method will return null when it fails to get the token.
     * @param code The authorization code provided via the /bunq/auth/callback URL.
     */
    getOAuthToken = async (code: string) => {
        const redirect = settings.app.url + "bunq/auth/callback"

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
            // Only log error, do not throw as this is mainly called on a scheduled basis.
            logger.error("Bunq.refreshUserData", ex)
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
        logger.debug("Bunq.getAccountBalance", alias)

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
    makePayment = async (options: PaymentOptions): Promise<Payment> => {
        logger.debug("Bunq.makePayment", options)

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

            // Notes must be handled as array.
            if (options.notes != null && _.isString(options.notes)) {
                options.notes = [options.notes as string]
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
                throw new Error("Payments must have an amount greater than 0.")
            }

            // Check if amount is under the maximum allowed.
            if (options.amount > settings.bunq.maxPaymentAmount) {
                throw new Error(`Payment amount ${niceAmount} is over the maximum allowed ${settings.bunq.maxPaymentAmount}.`)
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
            const now = moment()
            const logDraft = options.draft ? "Draft payment" : "Regular payment"
            const logAccount = _.find(this.accounts, {id: accountId}).description
            const logFromTo = `${niceAmount} ${options.currency} from ${logAccount} to ${options.toAlias}`
            let paymentId: any
            let paymentRecord: Payment

            logger.debug("Bunq.makePayment", "Will trigger now", `From account ${accountId}`, options)

            // Check if payments are disable. If so, log instead, otherwise proceed.
            if (settings.bunq.disablePayments) {
                paymentId = 0
                logger.warn("Bunq.makePayment", `${logDraft} ! DISABLED !`, logFromTo, options.description)
            } else {
                // Is it a draft or regular payment?
                if (options.draft) {
                    paymentId = await bunqClient.api.draftPayment.post(
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
                    paymentId = await bunqClient.api.payment.post(
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

                // Make sure we get the correct payment ID from response.
                if (_.isArray(paymentId)) {
                    paymentId = paymentId[0]
                }
                if (paymentId.Id) {
                    paymentId = paymentId.Id
                }
                if (paymentId.id) {
                    paymentId = paymentId.id
                }

                // Save payment record to database, which is a copy of
                // the payment options but with a date added.
                paymentRecord = _.cloneDeep(options)
                paymentRecord.id = paymentId
                paymentRecord.date = now.toDate()

                database.insert("payments", paymentRecord)
                this.events.emit("makePayment", paymentRecord)

                logger.info("Bunq.makePayment", logDraft, `ID ${paymentId}`, logFromTo, options.description)

                // Send notification of successful payment?
                if (settings.notification.events.paymentSuccess) {
                    const subject = `Payment ${niceAmount} to ${options.toAlias}`
                    const message = `Payment of ${niceAmount} ${options.currency}
                                    from account ${options.fromAlias} to ${options.toAlias} successful.
                                    \n
                                    Description: ${options.description}`

                    notifications.send({subject: subject, message: message})
                }
            }

            // Add notes to payment?
            if (paymentId) {
                if (options.notes != null && options.notes.length > 0) {
                    await this.addPaymentNotes(accountId, paymentId, options.notes as string[], options.draft)
                }

                // Add default notes to payment?
                if (settings.bunq.addPaymentNotes) {
                    await this.addPaymentNotes(accountId, paymentId, [`Triggered by ${settings.app.title}`], options.draft)
                }
            }

            return paymentRecord
        } catch (ex) {
            this.processBunqError(ex)
            this.failedPayment(options, ex, "processing")
            throw ex
        }
    }

    /**
     * Add notes to the specified payment.
     * @param accountId The ID of the monetary account.
     * @param paymentId The ID of the payment that was made previously.
     * @param notes Array of strings to be added as notes.
     */
    addPaymentNotes = async (accountId: number, paymentId: number, notes: string[], draft?: boolean): Promise<boolean> => {
        try {
            let eventType = draft ? "draft-paynent" : "payment"

            for (let note of notes) {
                await bunqClient.api.noteText.post(eventType, this.user.id, accountId, paymentId, note)
            }

            logger.info("Bunq.addPaymentNotes", `Payment ${paymentId} from account ${accountId}`, notes.join(", "))
            return true
        } catch (ex) {
            logger.error("Bunq.addPaymentNotes", `Payment ${paymentId} from account ${accountId}`, ex)
            return false
        }
    }

    // HELPERS
    // --------------------------------------------------------------------------

    /**
     * Helper to process and take action on errors from the bunq API.
     */
    private processBunqError = (ex: any) => {
        const statusCode = ex.response && ex.response.statusCode ? ex.response.statusCode : ex.statusCode || 500

        if (statusCode == 401 || statusCode == 403) {
            this.authNeeded()
        }
    }

    /**
     * Helper private function to handle failed payments.
     * @param options Options for the payment that failed
     * @param err The error or exeception object
     * @param step The payment step (preparing or processing)
     */
    private failedPayment = (options: PaymentOptions, err: any, step: string) => {
        let amount = (options.amount as number).toFixed(2)
        let errorString = err.toString()
        let resError = err.response

        // Catch error from response.
        if (resError && resError.body) {
            resError = resError.body
        }
        if (resError && resError.Error) {
            resError = resError.Error
        }
        if (resError && resError.length > 0) {
            resError = resError[0].error_description
        }

        if (resError) {
            errorString += ` - ${resError}`
        } else {
            resError = "Unkown API error"
        }

        logger.error("Bunq.failedPayment", `${step} payment`, `${amount} ${options.currency} to ${options.toAlias}`, err, resError)

        // Send notification of payment failures?
        if (settings.notification.events.paymentError) {
            // Make sure we have "Error" on the error string.
            if (errorString.indexOf("Error") < 0) {
                errorString = "Error - " + errorString
            }

            const subject = `Payment ${amount} failed to ${options.toAlias}`
            const message = `Payment of ${amount} ${options.currency}
                            from account ${options.fromAlias} to ${options.toAlias} failed.
                            \n
                            Description: ${options.description}
                            \n\n
                            ${errorString}
                            \n
                            ${resError}`

            // Send notification of failed payment.
            notifications.send({subject: subject, message: message})
        }
    }

    /**
     * Helper private function to alert when user needs to authenticate again.
     * Limits warnings to 1 every 8 hours.
     */
    private authNeeded = () => {
        if (lastAuthWarning.isBefore(moment().subtract(8, "hours"))) {
            lastAuthWarning = moment()
            console.warn(`
---------------------------------------------------------------
Please open ${settings.app.url + "login"} on your browser
---------------------------------------------------------------
`)

            // Build and send reauth notification.
            const subject = "Reauthentication needed"
            const message = `${settings.app.title} got an access error connecting to the bunq API.\
                            You might need to authenticate again at the URL ${settings.app.url}bunq/auth`
            notifications.send({subject: subject, message: message})
        }
    }
}

// Exports...
export = Bunq.Instance

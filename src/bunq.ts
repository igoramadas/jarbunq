// Bunq

import BunqJSClient from "@bunq-community/bunq-js-client"
import _ = require("lodash")
import crypto = require("crypto")
import database = require("./database")
import logger = require("anyhow")
import moment = require("moment")
import notifications = require("./notifications")
const settings = require("setmeup").settings
let bunqClient, lastAuthWarning: moment.Moment, authFailedCount: number

// Milliseconds in a day.
const msDay = 1000 * 60 * 60 * 24

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
        const result = database.get("jsClient.tokenTimestamp").value() != null

        if (!result) {
            this.authNeeded()
        }

        return result
    }

    /** The authentication URL used to start the OAuth2 flow. */
    get authUrl(): string {
        const redirect = settings.app.url + "bunq/auth/callback"
        const sandbox = settings.bunq.api.environment == "SANDBOX"
        return bunqClient.formatOAuthAuthorizationRequestUrl(settings.bunq.api.clientId, redirect, false, sandbox)
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

        // DEPRECATED! The notificationFilters setting should be migrate to the callbacks.enabled property.
        if (_.isBoolean(settings.bunq.notificationFilters)) {
            logger.warn("Bunq.init", "Please use settings.bunq.callbacks.enabled instead of settings.bunq.notificationFilters only.")
            settings.bunq.callbacks = {enabled: settings.bunq.notificationFilters}
            delete settings.bunq.notificationFilters
        }

        authFailedCount = 0
        lastAuthWarning = moment("2000-01-01")

        // Create bunq JS client.
        try {
            const store = {
                get: (key: string) => database.get(`jsClient.${key}`).value(),
                set: (key: string, value: any) => database.set(`jsClient.${key}`, value).write(),
                remove: (key: string) => database.unset(`jsClient.${key}`).write()
            }

            // Custom adapter wrapping the anyhow logger.
            const customLogger = {
                log: obj => {
                    logger.debug("BunqJSClient", obj)
                },
                trace: obj => {
                    logger.debug("BunqJSClient", obj)
                },
                debug: obj => {
                    logger.debug("BunqJSClient", obj)
                },
                info: obj => {
                    logger.info("BunqJSClient", obj)
                },
                warn: obj => {
                    logger.warn("BunqJSClient", obj)
                },
                error: obj => {
                    logger.error("BunqJSClient", obj)
                }
            }

            bunqClient = new BunqJSClient(store, customLogger)
            bunqClient.setKeepAlive(false)
        } catch (ex) {
            logger.error("Bunq", "Constructor", ex)
        }

        // Setup client.
        try {
            await bunqClient.run(settings.bunq.api.key, settings.bunq.api.ips, settings.bunq.api.environment, settings.bunq.api.cryptoKey)
            await bunqClient.install()
        } catch (ex) {
            logger.error("Bunq.init", "Error installing", settings.bunq.api.environment, ex)
            return process.exit()
        }

        // Register device and session.
        try {
            await bunqClient.registerDevice(settings.app.title)
            await bunqClient.registerSession()
        } catch (ex) {
            logger.error("Bunq.init", "Error registering device session", settings.bunq.api.environment, ex)
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

        // Setup callbacks?
        if (settings.bunq.callbacks.enabled) {
            try {
                await this.setupCallbacks()
            } catch (ex) {
                logger.error("Bunq.init", "Can't setup callbacks", ex)
                return process.exit()
            }
        }

        // Reminder to renew OAuth tokens.
        this.remindOAuthRenew()
    }

    /**
     * Get the OAuth2 access token based on the provided authorization code.
     * This method will return null when it fails to get the token.
     * @param code The authorization code provided via the /bunq/auth/callback URL.
     */
    getOAuthToken = async (code: string) => {
        const redirect = settings.app.url + "bunq/auth/callback"

        try {
            const sandbox = settings.bunq.api.environment == "SANDBOX"
            const token = await bunqClient.exchangeOAuthToken(settings.bunq.api.clientId, settings.bunq.api.clientSecret, redirect, code, false, sandbox, "authorization_code")

            if (!token) {
                throw new Error("Invalid access token")
            }

            // Save current date to database.
            database.set("jsClient.tokenTimestamp", moment().unix()).write()

            logger.info("Bunq.getOAuthToken", "Got a new access token")
            return true
        } catch (ex) {
            logger.error("Bunq.getOAuthToken", ex)
            return false
        }
    }

    /**
     * Send notification to remind user to renew the OAuth2 tokens
     * by logging in again and approving the access on bunq.
     */
    remindOAuthRenew = () => {
        const tokenDate = moment.unix(database.get("jsClient.tokenTimestamp").value())

        if (!tokenDate) {
            logger.debug("Bunq.remindOAuthRenew", "Not authenticated yet")
        } else {
            const diffDays = moment().diff(tokenDate) / msDay
            let days = Math.floor(settings.bunq.tokenLifetimehDays - diffDays)
            let remind = false

            if (days == 2 || days == 7) {
                remind = true
            }

            if (remind) {
                try {
                    const subject = `Jarbunq token expires in ${days} days`
                    const message = `The authorization tokens used by Jarbunq to connect to your bunq accounts will expire in ${days} days!
                                     <br><br>
                                     Please open ${settings.app.url}bunq/auth on your browser to renew the tokens and avoid interruptions.`

                    notifications.send({subject: subject, message: message})
                } catch (ex) {
                    logger.error("Bunq.remindOAuthRenew", `${days} days`, ex)
                }
            } else {
                days = logger.info("Bunq.remindOAuthRenew", `Token needs to be renewed in ${days} days`)
            }
        }

        // Run next day again.
        _.delay(this.remindOAuthRenew, msDay)
    }

    // CALLBACKS (NOTIFICATION FILTERS)
    // --------------------------------------------------------------------------

    /**
     * Setup the callbacks (notification filters) so bunq will dispatch events
     * related to the user's accounts to Jarbunq. Please note that this will
     * only work if Jarbunq is accessible from the internet!
     * @event setupCallbacks
     */
    setupCallbacks = async () => {
        const callbacks = []
        const baseUrl = settings.app.url

        if (baseUrl.indexOf("bunq.local") > 0) {
            logger.error("Jarbunq.setupCallbacks", `Can't setup callbacks from bunq using a local URL: ${baseUrl}`)
            return
        }

        const aliasesFromSettings = Object.values(settings.bunq.accounts)
        let userId, limiter

        try {
            userId = this.user.id
            limiter = bunqClient.ApiAdapter.RequestLimitFactory.create("/monetary-account", "POST")
        } catch (ex) {
            logger.error("Jarbunq.setupCallbacks", ex)
            return
        }

        // Iterate accounts to create individual notification filters, but only for accounts
        // that are listed on settings.bunq.accounts.
        for (let acc of this.accounts) {
            const aliases = _.map(acc.alias, "value")
            const intersect = _.intersection(aliases, aliasesFromSettings)

            if (intersect.length == 0) {
                logger.debug("Jarbunq.setupCallbacks", `Account ${acc.id} has no matching aliases on settings.bunq.accounts`, "Skip!")
            } else {
                const logAccount = this.getAccountFromAlias(intersect[0], true)
                const filterIds = []

                try {
                    let filters = {
                        notification_filters: []
                    }

                    // Build the notification filters object.
                    for (let category of settings.bunq.callbacks.categories) {
                        filters.notification_filters.push({
                            category: category,
                            notification_target: `${baseUrl}bunq/callback/${acc.id}`
                        })
                    }

                    // Response limiter taken directly from the bunqJSClient.
                    const response = await limiter.run(async axiosClient =>
                        bunqClient.ApiAdapter.post(`/v1/user/${userId}/monetary-account/${acc.id}/notification-filter-url`, filters, {}, {}, axiosClient)
                    )

                    // Valid response? Add the result to the callbacks list.
                    if (response.Response && response.Response.length > 0 && response.Response[0].NotificationFilterUrl) {
                        const responseFilter = response.Response[0].NotificationFilterUrl
                        const filter = {id: responseFilter.id, category: responseFilter.category, date: responseFilter.updated}

                        callbacks.push(filter)
                        filterIds.push(filter.id)
                    } else {
                        throw new Error(`The callback response is blank or invalid`)
                    }
                } catch (ex) {
                    logger.error("Jarbunq.setupCallbacks", logAccount, ex)
                }

                const logFilterIds = filterIds.join(", ")
                logger.info("Jarbunq.setupCallbacks", `For account ${logAccount}: ${logFilterIds}`)
            }
        }

        this.events.emit("setupCallbacks", callbacks)

        // Reset callbacks every few hour(s).
        setTimeout(this.setupCallbacks, 1000 * 60 * settings.bunq.refreshMinutes * 3)
    }

    /**
     * Get list of registered callbacks (URL notification filters) at bunq.
     */
    getCallbacks = async () => {
        const aliasesFromSettings = Object.values(settings.bunq.accounts)
        let userId, limiter

        try {
            userId = this.user.id
            limiter = bunqClient.ApiAdapter.RequestLimitFactory.create("/monetary-account", "POST")
        } catch (ex) {
            logger.error("Jarbunq.getCallbacks", ex)
            return
        }

        let result: any = {}

        // Iterate accounts to create individual callbacks, but only for accounts
        // that are listed on settings.bunq.accounts.
        for (let acc of this.accounts) {
            const aliases = _.map(acc.alias, "value")
            const intersect = _.intersection(aliases, aliasesFromSettings)

            if (intersect.length == 0) {
                logger.debug("Jarbunq.getCallbacks", `Account ${acc.id} has no matching aliases on settings.bunq.accounts`, "Skip!")
            } else {
                const logAccount = this.getAccountFromAlias(intersect[0], true)

                try {
                    const response = await limiter.run(async axiosClient => bunqClient.ApiAdapter.get(`/v1/user/${userId}/monetary-account/${acc.id}/notification-filter-url`, {}, {}, axiosClient))

                    // Valid response?
                    if (response.Response && response.Response.length > 0) {
                        result[intersect[0]] = response.Response
                    }
                } catch (ex) {
                    logger.error("Jarbunq.getCallbacks", logAccount, ex)
                }
            }
        }

        // Return callbacks.
        return result
    }

    /**
     * Process a callback (notification) sent by bunq.
     * @event callback
     */
    callback = async (notification: BunqCallback) => {
        let account, accountName, eventType

        try {
            account = _.find(this.accounts, {id: notification.accountId})
            accountName = account ? account.description : notification.accountId || "unknown"
            eventType = notification.eventType || notification.category

            logger.info("Bunq.callback", notification.id, eventType, `Account: ${accountName}`, notification.description)
            this.events.emit(`callback`, notification)
        } catch (ex) {
            logger.error("Bunq.callback", notification.id, eventType, `Account: ${accountName}`, notification.description, ex)
        }
    }

    // MAIN METHODS
    // --------------------------------------------------------------------------

    /**
     * Load user info and its main accounts.
     */
    refreshUserData = async () => {
        try {
            await bunqClient.registerSession()
        } catch (ex) {
            logger.debug("Bunq.refreshUserData", "Can't register session", ex)
        }

        try {
            await this.getUser()
            await this.getAccounts()
            authFailedCount = 0
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
            return this.user
        } catch (ex) {
            this.processBunqError(ex)
            logger.error("Bunq.getUser", ex)
            throw ex
        }
    }

    /**
     * Get all the relevant accounts for the user.
     * @event getAccounts
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

            const updatedAccounts = []
            const diffAccountNames = []

            // Iterate and populate account list. This will also append
            // a "type" to the account properties.
            for (let acc of accounts) {
                let firstKey = Object.keys(acc)[0]
                acc[firstKey].type = firstKey.replace("MonetaryAccount", "")
                updatedAccounts.push(acc[firstKey])

                // New account description?
                if (!this.accounts || !_.find(this.accounts, {description: acc[firstKey].description})) {
                    diffAccountNames.push(acc[firstKey].description)
                }
            }

            this.accounts = updatedAccounts

            const logChangedAccounts = diffAccountNames.length > 0 ? "Changed: " + diffAccountNames.join(", ") : "No changes"
            logger.info("Bunq.getAccounts", `Got ${accounts.length} accounts`, logChangedAccounts)
            this.events.emit("getAccounts", this.accounts)

            return this.accounts
        } catch (ex) {
            this.processBunqError(ex)
            logger.error("Bunq.getAccounts", ex)
            throw ex
        }
    }

    /**
     * Get the account details for the specified alias.
     * If second parameter is true, it won't throw exception for account not found.
     * @param alias The email, phone or IBAN of the owner's account.
     * @param returnAsName If true, will return the account name or the passed alias if account not found.
     */
    getAccountFromAlias = (alias: string | number, returnAsName?: boolean) => {
        logger.debug("Bunq.getAccountFromAlias", alias, returnAsName)

        try {
            if (!this.authenticated) {
                throw new Error("Not authenticated to bunq")
            }

            const acc = _.find(this.accounts, a => {
                return _.find(a.alias, {value: alias}) != null
            })

            if (!acc) {
                if (returnAsName) {
                    return alias
                } else {
                    throw new Error(`Account ${alias} not found.`)
                }
            }

            if (returnAsName) {
                return acc.description
            } else {
                return acc
            }
        } catch (ex) {
            logger.error("Bunq.getAccountFromAlias", alias, ex)

            if (returnAsName) {
                return alias
            } else {
                throw ex
            }
        }
    }

    /**
     * Get the current account balance for the specified alias.
     * @param alias The email, phone or IBAN of the account.
     */
    getAccountBalance = async (alias: string | number) => {
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
     * @event makePayment
     */
    makePayment = async (options: PaymentOptions): Promise<Payment> => {
        logger.debug("Bunq.makePayment", options)

        const alias: any = {value: options.toAlias}
        let accountId, niceAmount

        try {
            if (_.isString(options.amount)) {
                options.amount = parseFloat(options.amount as any)
            }

            // Make sure we round to 2 decimals.
            options.amount += 0.0001
            options.amount = Math.round(options.amount * 100) / 100

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

            niceAmount = options.amount.toFixed(2)

            // Always handle notes as array.
            if (options.notes != null && _.isString(options.notes)) {
                options.notes = [options.notes as string]
            }

            if (!this.authenticated) {
                throw new Error("Not authenticated to bunq")
            }

            // Basic payment validation.
            if (options.amount <= 0) {
                throw new Error("Payments must have an amount greater than 0.")
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

            const toAliasString = options.toAlias.toString()

            // Set alias to email, phone or IBAN depending on its value.
            if (toAliasString.indexOf("@") > 0) {
                alias.type = "EMAIL"
            } else if (toAliasString.length < 15) {
                alias.type = "PHONE_NUMBER"
            } else {
                alias.type = "IBAN"
                alias.name = options.toName
            }

            // Create a payment reference, if none was specified. Please note
            // that this is the internal database reference, do not confuse with
            // the payment description (called reference as well by some banks).
            if (!options.reference) {
                const description = options.description ? options.description.toString().replace(/ /, "") : options.draft.toString()
                options.reference = `${moment().format("YYMMDD")}-${niceAmount}-${options.toAlias}-${description}`
            }

            // Check if amount is under the maximum allowed.
            if (!options.draft && options.amount > settings.bunq.maxPaymentAmount) {
                logger.warn("Bunq.makePayment", options.reference, `Amount ${niceAmount} over the maximum ${settings.bunq.maxPaymentAmount}, automatically set as draft`)
                options.draft = true
            }

            // Make hash from reference.
            const hash = crypto.createHash("sha1")
            options.hash = hash.update(options.reference).digest("hex")

            // Make sure payment was not made before.
            const existingPayment = database.get("payments").find({hash: options.hash})
            if (existingPayment.value()) {
                throw new Error(`Duplicate payment: ${options.reference}`)
            }

            authFailedCount = 0
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
                // TODO! Remove and leave only correct condition after bunq API is on stable v1.
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
                    const fromAccount = this.getAccountFromAlias(options.fromAlias, true)
                    const toAccount = this.getAccountFromAlias(options.toAlias, true)

                    const subject = `${niceAmount} ${options.currency} from ${fromAccount} to ${toAccount}`
                    const message = `Payment of ${niceAmount} ${options.currency} from account ${options.fromAlias} to ${options.toAlias} successful.
                                    <br>
                                    Description: ${options.description}`

                    notifications.send({subject: subject, message: message})
                }
            }

            // Add notes to payment?
            if (paymentId && settings.bunq.addPaymentNotes) {
                await this.addPaymentNotes(accountId, paymentId, [`Triggered by ${settings.app.title}`], options.draft)

                if (options.notes != null && options.notes.length > 0) {
                    await this.addPaymentNotes(accountId, paymentId, options.notes as string[], options.draft)
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
     * Reverse (refund) a payment made by Jarbunq. Will only work if
     * both source and target bunq accounts are owned by the user.
     * @param payment The payment object to be reversed.
     * @event reversePayment
     */
    reversePayment = async (payment: Payment): Promise<Payment> => {
        const paymentId = payment.id
        const paymentDate = moment(payment.date).format("YYYY-MM-DD")

        try {
            let paymentOptions = _.cloneDeep(payment) as PaymentOptions

            // Payment already reversed? Stop here.
            if (payment.reverseId) {
                throw new Error(`Payment already reversed, ID ${payment.reverseId}`)
            }

            // Reverse the source and target accounts.
            const fromAlias = paymentOptions.toAlias
            const toAlias = paymentOptions.fromAlias
            paymentOptions.fromAlias = fromAlias
            paymentOptions.toAlias = toAlias

            // Append reversal note.
            const notes = (paymentOptions.notes as string[]) || []
            notes.unshift(`Reversal for payment ${paymentId}, ${paymentDate}`)
            paymentOptions.notes = notes

            // Make payment reversal.
            let reversePayment = await this.makePayment(paymentOptions)

            // Add reverse payment ID to the original.
            const findPayment = database.get("payments").find({id: paymentId})
            findPayment.assign({reverseId: reversePayment.id}).write()

            return reversePayment
        } catch (ex) {
            logger.error("Bunq.reversePayment", paymentId, paymentDate, ex)
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
        if (!settings.bunq.addPaymentNotes) {
            logger.warn("Bunq.addPaymentNotes", `Payment ${paymentId} from account ${accountId}`, "The settings.bunq.addPaymentNotes is disabled, will not add notes")
            return false
        }

        let eventType = draft ? "draft-paynent" : "payment"
        let addedNotes = []
        let result = true

        // Iterate and add payment notes.
        for (let note of notes) {
            try {
                await bunqClient.api.noteText.post(eventType, this.user.id, accountId, paymentId, note)
                addedNotes.push(note)
            } catch (ex) {
                logger.error("Bunq.addPaymentNotes", `Payment ${paymentId} on account ${accountId}`, note, ex)
                result = false
            }
        }

        // Any notes added?
        if (addedNotes.length > 0) {
            logger.info("Bunq.addPaymentNotes", `Payment ${paymentId} on account ${accountId}`, addedNotes.join(", "))
        }

        return result
    }

    // HELPERS
    // --------------------------------------------------------------------------

    /**
     * Helper to process and take action on errors from the bunq API.
     */
    private processBunqError = (ex: any) => {
        const statusCode = ex.response && ex.response.statusCode ? ex.response.statusCode : ex.statusCode

        if (statusCode == 401 || statusCode == 403 || ex.toString().indexOf("status code 401") > 0) {
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
        const niceAmount = options.amount.toFixed(2)
        let errorString = err.toString()
        let resError = err.response

        // Catch error from response.
        if (resError && resError.body) {
            resError = resError.body
        }
        if (resError && resError.data) {
            resError = resError.data
        }
        if (resError && resError.Error) {
            resError = resError.Error
        }
        if (resError && resError.error) {
            resError = resError.error
        }
        if (_.isArray(resError) && resError.length > 0) {
            resError = resError[0].error_description
        }

        if (!resError) {
            resError = _.isString(err) ? err : "Unkown API error"
        }

        logger.error("Bunq.failedPayment", `${step} payment`, `${niceAmount} ${options.currency} to ${options.toAlias}`, err, resError)

        // Send notification of payment failures?
        if (settings.notification.events.paymentError) {
            if (errorString.toLowerCase().indexOf("error") < 0) {
                errorString = "Error - " + errorString
            }

            const fromAccount = this.getAccountFromAlias(options.fromAlias, true)
            const toAccount = this.getAccountFromAlias(options.toAlias, true)

            const subject = `Failed: ${niceAmount} ${options.currency} from ${fromAccount} to ${toAccount}`
            const message = `Payment of ${niceAmount} ${options.currency} from account ${options.fromAlias} to ${options.toAlias} failed.
                            <br>
                            Description: ${options.description}
                            <br>
                            ${errorString}
                            <br>
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
        authFailedCount++

        // Only alert user if it failed at least 3 times and last warning was over 8 hours ago.
        if (authFailedCount > 2 && lastAuthWarning.isBefore(moment().subtract(8, "hours"))) {
            lastAuthWarning = moment()

            if (process.env.NODE_ENV != "production") {
                console.warn(`
---------------------------------------------------------------
Please open ${settings.app.url + "login"} on your browser
---------------------------------------------------------------
`)
            }

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

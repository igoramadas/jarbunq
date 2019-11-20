// Strava

import _ = require("lodash")
import bunq = require("./bunq")
import database = require("./database")
import logger = require("anyhow")
import moment = require("moment")
import request = require("request-promise-native")
const settings = require("setmeup").settings

/**
 * Gets rides and activities from Strava.
 */
class Strava extends require("./base-events") {
    private static _instance: Strava
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    // PROPERTIES
    // --------------------------------------------------------------------------

    /** The authentication URL used to start the OAuth2 flow with Strava. */
    get authUrl(): string {
        return `${settings.strava.api.authUrl}?client_id=${settings.strava.api.clientId}&redirect_uri=${settings.app.url}strava/auth/callback&response_type=code&scope=${settings.strava.api.scope}`
    }

    /** Timer to trigger the payments (via setTimeout). */
    timerPay: any

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the Strava module by setting up the payment timer.
     */
    init = async (): Promise<void> => {
        const now = moment()
        const day = now.isoWeekday()
        const ms8Hours = 1000 * 60 * 60 * 8
        const paymentInterval = settings.strava.payments.interval

        // DEPRECATED! Strava credentials moved to strava.api.
        if (settings.strava.clientId || settings.strava.clientSecret) {
            logger.warn("Strava.init", "The clientId and clientSecret moved from settings.strava to settings.strava.api. Please update your settings.")

            if (settings.strava.clientId && !settings.strava.api.clientId) {
                settings.strava.api.clientId = settings.strava.clientId
            }
            if (settings.strava.clientSecret && !settings.strava.api.clientSecret) {
                settings.strava.api.clientSecret = settings.strava.clientSecret
            }
        }

        // Missing credentials? Stop here.
        if (!settings.strava.api.clientId || !settings.strava.api.clientSecret) {
            return logger.warn("Strava.init", "Missing strava clientId, clientSecret or refreshToken", "Strava features won't be enabled")
        }

        // Refresh the access token and user info first.
        try {
            await this.refreshToken()
            await this.getAthlete()
        } catch (ex) {
            logger.error("Strava.init", "Could not refresh access token and load user info")
            return
        }

        // Target date.
        const target = moment(now.format("YYYY-MM-DD") + " " + settings.strava.payments.time)

        // Payment interval must be daily or weekly.
        if (paymentInterval != "weekly" && paymentInterval != "daily") {
            throw new Error(`Invalid payment interval: ${paymentInterval}, must be daily or weekly.`)
        }

        // Weekly payment and today is not Monday? Add remaining days.
        if (paymentInterval == "weekly" && day > 1) {
            target.add(8 - day, "days")
        }

        if (now.isAfter(target)) {
            // Maybe we just missed the payment? Check the database, if we're less than 8 hours
            // from the execution time at same day, and no payment was recorded yet, then do it now.
            if (now.diff(target) <= ms8Hours && now.format("HH:mm") > settings.strava.payments.time) {
                const paymentFinder = p => {
                    return moment(p.date).dayOfYear() == now.dayOfYear()
                }
                const allPayments = database.get("stravaPayments")
                const existingPayment = allPayments.find(paymentFinder).value()

                // There was a payment today?
                if (existingPayment == null) {
                    logger.info("Strava.init", `Missed today's payment at ${settings.strava.payments.time}, will execute it now`)
                    this.payForActivities()
                } else {
                    logger.info("Strava.init", `Today's payment was already processed, ID ${existingPayment.payment.id}`)
                }
            }

            target.add(1, "days")
        }

        const diff = target.diff(now)
        this.timerPay = setTimeout(this.payForActivities, diff)

        // Log successful init.
        const timeToNext = moment.duration(diff).humanize(true)
        logger.info("Strava.init", paymentInterval, `${settings.strava.payments.pricePerKm} EUR / km`, `Next payment ${timeToNext}`)
    }

    // AUTH METHODS
    // --------------------------------------------------------------------------

    /**
     * Get the OAuth2 access token based on the provided authorization code.
     * This method will return null when it fails to get the token.
     * @param code The authorization code provided via the /strava/auth/callback URL.
     */
    getOAuthToken = async (code: string) => {
        try {
            let qs = {
                grant_type: "authorization_code",
                client_id: settings.strava.api.clientId,
                client_secret: settings.strava.api.clientSecret,
                redirect_uri: `${settings.app.url}strava/auth/callback`,
                code: code
            }

            let options = {
                method: "POST",
                uri: settings.strava.api.tokenUrl,
                qs: qs,
                json: true,
                resolveWithFullResponse: true
            }

            // Post to the token endpoint.
            let res = await request(options)

            if (!res) {
                throw new Error("Invalid access token")
            }

            // Save new tokens to database.
            const stravaData = {
                accessToken: res.body.access_token,
                refreshToken: res.body.refresh_token
            }
            database.set("strava", stravaData).write()

            // Schedule next refresh based on the expiry date, 10 minutes before.
            const interval = moment.unix(res.body.expires_at).diff(moment()) - 600000
            setTimeout(this.refreshToken, interval)

            logger.info("Strava.getOAuthToken", "Got a new set of access + refresh tokens")
            return true
        } catch (ex) {
            logger.error("Strava.getOAuthToken", ex)
            return false
        }
    }

    /**
     * Refresh OAuth2 tokens from Strava.
     * @event refreshToken
     */
    refreshToken = async () => {
        try {
            const qs: any = {
                grant_type: "refresh_token",
                client_id: settings.strava.api.clientId,
                client_secret: settings.strava.api.clientSecret
            }

            // Check if a refresh token is available on the database.
            // If not, use the one specified initially on the settings.
            let stravaData = database.get("strava").value()
            if (stravaData != null) {
                qs.refresh_token = stravaData.refreshToken
            } else {
                qs.refresh_token = settings.strava.api.refreshToken
            }

            let options = {
                method: "POST",
                uri: settings.strava.api.tokenUrl,
                qs: qs,
                json: true,
                resolveWithFullResponse: true
            }

            // Post to the token endpoint.
            let res = await request(options)

            if (res == null || res.body == null) {
                throw new Error("Invalid or empty token response.")
            }

            // Save new tokens to database.
            stravaData = {
                accessToken: res.body.access_token,
                refreshToken: res.body.refresh_token
            }
            database.set("strava", stravaData).write()

            this.events.emit("refreshToken")

            // Schedule next refresh based on the expiry date, 10 minutes before.
            const interval = moment.unix(res.body.expires_at).diff(moment()) - 600000
            setTimeout(this.refreshToken, interval)

            const nextRefresh = moment.duration(interval).humanize(true)
            logger.info("Strava.refreshTokens", `Next refresh ${nextRefresh}`)
        } catch (ex) {
            if (ex.response && ex.response.body.errors) {
                const code = ex.response.statusCode || ex.response.status
                const errDetails = Object.values(ex.response.body.errors[0])

                logger.error("Strava.refreshToken", `Status ${code}`, errDetails.join(" "))

                if (errDetails.indexOf("invalid") >= 0) {
                    console.warn(`
---------------------------------------------------------------
Please open ${settings.app.url + "strava/auth"} on your browser
---------------------------------------------------------------
`)
                }
            } else {
                logger.error("Strava.refreshToken", ex)
            }
        }
    }

    // API METHODS
    // --------------------------------------------------------------------------

    /**
     * Internal implementation to make a request to the Strava API.
     * @param path The API path.
     * @param params Additional parameters to be passed.
     */
    makeRequest = async (path: string, params?: any) => {
        try {
            if (!params) {
                params = {}
            }

            // Check if an access token is available on the database.
            // If not, use the one specified initially on the settings.
            const stravaData = database.get("strava").value()
            if (stravaData != null) {
                params.access_token = stravaData.accessToken
            } else {
                params.access_token = settings.strava.accessToken
            }

            let options = {
                uri: settings.strava.api.baseUrl + path,
                qs: params,
                json: true,
                resolveWithFullResponse: true
            }

            let res = await request(options)

            if (res == null || res.body == null) {
                throw new Error("Invalid or empty response.")
            }

            return res.body
        } catch (ex) {
            logger.error("Strava.makeRequest", path, ex)
            throw ex
        }
    }

    /**
     * Get general info for the logged user.
     */
    getAthlete = async () => {
        try {
            let result = await this.makeRequest("/athlete")
            logger.info("Strava.getAthlete", `ID ${result.id}`, result.username)
            return result
        } catch (ex) {
            logger.error("Strava.getAthlete", ex)
            throw ex
        }
    }

    /**
     * Get list of activities from Strava.
     * @param query Query options, currently only supports "since".
     */
    getActivities = async (query: any) => {
        logger.debug("Strava.getRecentActivities", query)

        const arrLogQuery = Object.entries(query).map(p => p[0] + "=" + p[1])
        const logQuery = arrLogQuery.join(", ")

        try {
            let result: Activity[] = []

            // Default query options.
            if (!query.per_page) {
                query.per_page = 200
            }

            // Fetch user activities from Strava.
            let activities = await this.makeRequest("/athlete/activities", query)

            // Iterate result to create activity results.
            for (let a of activities) {
                const movingTime = moment.duration(a.moving_time * 1000)
                const arrMovingTime: any[] = [movingTime.hours(), movingTime.minutes(), movingTime.seconds()]
                const elapsedTime = moment.duration(a.elapsed_time * 1000)
                const arrElapsedTime: any[] = [elapsedTime.hours(), elapsedTime.minutes(), elapsedTime.seconds()]

                // Make sure times have leading zeroes.
                for (let i = 0; i < 2; i++) {
                    if (arrMovingTime[i] < 10) {
                        arrMovingTime[i] = "0" + arrMovingTime[i].toString()
                    }
                    if (arrElapsedTime[i] < 10) {
                        arrElapsedTime[i] = "0" + arrElapsedTime[i].toString()
                    }
                }

                // Create activity object.
                let activity: Activity = {
                    name: a.name,
                    date: moment(a.start_date).toDate(),
                    distance: Math.round(a.distance / 1000),
                    elevation: a.total_elevation_gain,
                    movingTime: arrMovingTime.join(":"),
                    elapsedTime: arrElapsedTime.join(":"),
                    location: a.location_country
                }

                result.push(activity)
            }

            const logDistances = _.map(result, "distance").join(", ")
            logger.info("Strava.getActivities", logQuery, `Got ${result.length} activities`, `Distances: ${logDistances}`)

            return result
        } catch (ex) {
            logger.error("Strava.getActivities", logQuery, ex)
            throw ex
        }
    }

    /**
     * Get recent activities from Strava (today is always excluded).
     * @param since Since that many days, for example 7 gets all activities for last 7 days excluding today.
     */
    getRecentActivities = async (since: number) => {
        logger.debug("Strava.getRecentActivities", since)

        try {
            let after = moment().subtract(since, "days")
            let before = moment().subtract(1, "days")

            // Set after and before midnight.
            after.hours(0)
            after.minutes(0)
            after.seconds(0)
            before.hours(23)
            before.minutes(59)
            before.seconds(59)

            let query = {
                after: after.unix() - 1,
                before: before.unix() + 1
            }

            let result = await this.getActivities(query)
            return result
        } catch (ex) {
            throw ex
        }
    }

    // PAYMENT METHODS
    // --------------------------------------------------------------------------

    /**
     * Make a payment regarding the mileage of recent activities.
     * @event payForActivities
     */
    payForActivities = async () => {
        try {
            const paymentInterval = settings.strava.payments.interval
            const since = paymentInterval == "weekly" ? 7 : 1
            const activities = await this.getRecentActivities(since)
            const distance = _.sumBy(activities, "distance")
            const elevation = _.sumBy(activities, "elevation")
            const totalKm = Math.round(distance + elevation / 1000)
            const now = moment()

            logger.debug("Strava.payForActivities", paymentInterval, `Distance ${distance}`, `Elevation ${elevation}`, `Total ${totalKm}`)

            // Not enough mileage for this period?
            if (distance < 1) {
                return logger.warn("Strava.payForActivities", "Not enough mileage, payment skipped")
            }

            // Calculate total amount based on distance and elevation.
            const amount = totalKm * settings.strava.payments.pricePerKm

            // Define payment options.
            const paymentOptions = {
                amount: amount,
                description: `Strava, ${distance}km ${paymentInterval}`,
                toAlias: settings.bunq.accounts.strava,
                reference: `strava-${now.format("YYYY-MM-DD")}`
            }

            // Dispatch payment.
            const payment = await bunq.makePayment(paymentOptions)

            const stravaPayment: StravaPayment = {
                date: now.toDate(),
                totalKm: totalKm,
                activityCount: activities.length,
                payment: {
                    id: payment.id,
                    amount: amount
                }
            }

            // Save to database and emit to listeners.
            database.insert("stravaPayments", stravaPayment)
            this.events.emit("payForActivities", stravaPayment)

            // Get interval to next payment.
            let interval
            if (settings.strava.payments.interval == "weekly") {
                interval = 604800000
            } else if (settings.strava.payments.interval == "daily") {
                interval = 86400000
            }

            // Scheduled next payment.
            this.timerPay = setTimeout(this.payForActivities, interval)

            logger.info("Strava.payForActivities", `Transferred ${amount.toFixed(2)} for ${totalKm}km`, `Next payment`)
        } catch (ex) {
            logger.error("Strava.payForActivities", ex)
        }
    }
}

// Exports...
export = Strava.Instance

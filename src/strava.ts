// Strava

import BaseEvents = require("./base-events")
import {Activity, StravaPayment} from "./types"

const _ = require("lodash")
const bunq = require("./bunq")
const database = require("./database")
const logger = require("anyhow")
const moment = require("moment")
const request = require("request-promise-native")
const settings = require("setmeup").settings

// Strava API URL.
const apiUrl = "https://www.strava.com/api/v3"
const tokenUrl = "https://www.strava.com/oauth/token"

/**
 * Gets rides and activities from Strava.
 */
class Strava extends BaseEvents {
    private static _instance: Strava
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    // PROPERTIES
    // --------------------------------------------------------------------------

    /** Timer to trigger the payments (via setTimeout). */
    timerPay: any

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the Strava module by setting up the payment timer.
     */
    async init() {
        if (!settings.strava.clientId || !settings.strava.clientSecret || !settings.strava.refreshToken) {
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

        // Milliseconds in a day and in 4 hours.
        const msDay = 1000 * 60 * 60 * 24
        const ms4Hours = 1000 * 60 * 60 * 4

        const paymentInterval = settings.strava.payments.interval
        const now = moment()
        const day = now.day()
        const target = moment(now.format("YYYY-MM-DD") + " " + settings.strava.payments.time)
        let diff

        // Calculate how many days till next paymentm, if weekly.
        if (paymentInterval == "weekly") {
            if (day == 0) {
                target.add(1, "days")
            } else if (day > 1) {
                target.add(8 - day, "days")
            }

            diff = target.diff(now)
        } else if (paymentInterval == "daily") {
            diff = target.diff(now)
        } else {
            throw new Error(`Invalid payment interval: ${paymentInterval}, must be daily or weekly.`)
        }

        // If we're past the execution time, add 24 hours and subtract the difference.
        // The diff is already negative in this case, hence we do a + instead of - here.
        if (now.isAfter(target)) {
            // Maybe we just missed the payment? Check the database, if we're less than 4 hours
            // close to the execution time and no payment was recorded today, then do it now.
            if (diff > ms4Hours * -1 && database.get("payments").find({reference: `strava-${now.format("YYYY-MM-DD")}`}) == null) {
                logger.info("Strava.init", `Missed payment at ${settings.strava.payments.time}, will execute it now`)
                this.payForActivities()
            }

            // Add 1 day to the interval.
            diff = msDay + diff
        }

        this.timerPay = setTimeout(this.payForActivities, diff)

        // Log successful init.
        const timeToNext = moment.duration(diff).humanize(true)
        logger.info("Strava.init", paymentInterval, `${settings.strava.payments.pricePerKm} EUR / km`, `Next payment ${timeToNext}`)
    }

    // API METHODS
    // --------------------------------------------------------------------------

    /**
     * Refresh OAuth2 tokens from Strava.
     */
    refreshToken = async () => {
        try {
            const qs: any = {
                grant_type: "refresh_token",
                client_id: settings.strava.clientId,
                client_secret: settings.strava.clientSecret
            }

            // Check if a refresh token is available on the database.
            // If not, use the one specified initially on the settings.
            let stravaData = database.get("strava").value()
            if (stravaData != null) {
                qs.refresh_token = stravaData.refreshToken
            } else {
                qs.refresh_token = settings.strava.refreshToken
            }

            let options = {
                method: "POST",
                uri: tokenUrl,
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
            this.events.emit("refreshTokens")

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
Please open https://www.strava.com/settings/api on your browser
and copy the Refresh Token to settings.strava.refreshToken
---------------------------------------------------------------
`)
                }
            } else {
                logger.error("Strava.refreshToken", ex)
            }

            throw ex
        }
    }

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
                uri: apiUrl + path,
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
                const arrMovingTime = [movingTime.hours(), movingTime.minutes(), movingTime.seconds()]
                const elapsedTime = moment.duration(a.elapsed_time * 1000)
                const arrElapsedTime = [elapsedTime.hours(), elapsedTime.minutes(), elapsedTime.seconds()]

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
                    date: moment(a.date).toDate(),
                    distance: Math.round(a.distance / 1000),
                    elevation: a.total_elevation_gain,
                    movingTime: arrMovingTime.join(":"),
                    elapsedTime: arrElapsedTime.join(":"),

                    location: a.location_country
                }

                result.push(activity)
            }

            logger.info("Strava.getActivities", logQuery, `Got ${result.length} activities`)

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
                after: after.unix(),
                before: before.unix()
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
     */
    payForActivities = async () => {
        try {
            const paymentInterval = settings.strava.payments.interval
            const since = paymentInterval == "weekly" ? 7 : 1
            const activities = await this.getRecentActivities(since)
            const distance = _.sumBy(activities, "distance")
            const elevation = _.sumBy(activities, "elevation")
            const totalKm = distance + elevation / 1000
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

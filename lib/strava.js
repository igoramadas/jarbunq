"use strict";
// Strava
const BaseEvents = require("./base-events");
const _ = require("lodash");
const bunq = require("./bunq");
const logger = require("anyhow");
const moment = require("moment");
const request = require("request-promise-native");
const settings = require("setmeup").settings;
/**
 * Gets rides and activities from Strava.
 */
class Strava extends BaseEvents {
    constructor() {
        super(...arguments);
        // API METHODS
        // --------------------------------------------------------------------------
        /**
         * Internal implementation to make a request to the Strava API.
         * @param path The API path.
         * @param params Additional parameters to be passed.
         */
        this.makeRequest = async (path, params) => {
            try {
                if (!params) {
                    params = {};
                }
                // Pass access token.
                params.access_token = settings.strava.accessToken;
                let options = {
                    uri: settings.strava.api.url + path,
                    qs: params,
                    json: true,
                    resolveWithFullResponse: true
                };
                let res = await request(options);
                if (!res) {
                    throw new Error("Invalid or empty response.");
                }
                if (res.statusCode >= 400 && res.statusCode <= 599) {
                    throw new Error("HTTP error " + res.statusCode);
                }
                if (res.body && res.body.errors) {
                    throw new Error("API Error " + res.statusCode);
                }
                return res.body;
            }
            catch (ex) {
                logger.error("Strava.makeRequest", path, ex);
                throw ex;
            }
        };
        /**
         * Get list of activities from Strava.
         * @param query Query options, currently only supports "since".
         */
        this.getActivities = async (query) => {
            const arrLogQuery = Object.entries(query).map(p => p[0] + "=" + p[1]);
            const logQuery = arrLogQuery.join(", ");
            try {
                let result = [];
                // Default query options.
                if (!query.per_page) {
                    query.per_page = 200;
                }
                // Fetch user activities from Strava.
                let activities = await this.makeRequest("/athlete/activities", query);
                // Iterate result to create activity results.
                for (let a of activities) {
                    const movingTime = moment.duration(a.moving_time * 1000);
                    const arrMovingTime = [movingTime.hours(), movingTime.minutes(), movingTime.seconds()];
                    const elapsedTime = moment.duration(a.elapsed_time * 1000);
                    const arrElapsedTime = [elapsedTime.hours(), elapsedTime.minutes(), elapsedTime.seconds()];
                    // Make sure times have leading zeroes.
                    for (let i = 0; i < 2; i++) {
                        if (arrMovingTime[i] < 10) {
                            arrMovingTime[i] = "0" + arrMovingTime[i].toString();
                        }
                        if (arrElapsedTime[i] < 10) {
                            arrElapsedTime[i] = "0" + arrElapsedTime[i].toString();
                        }
                    }
                    // Create activity object.
                    let activity = {
                        name: a.name,
                        date: moment(a.date).toDate(),
                        distance: Math.round(a.distance / 1000),
                        elevation: a.total_elevation_gain,
                        movingTime: arrMovingTime.join(":"),
                        elapsedTime: arrElapsedTime.join(":"),
                        location: a.location_country
                    };
                    result.push(activity);
                }
                logger.info("Strava.getActivities", logQuery, `Got ${result.length} activities`);
                return result;
            }
            catch (ex) {
                logger.error("Strava.getActivities", logQuery, ex);
                throw ex;
            }
        };
        /**
         * Get recent activities from Strava (today is always excluded).
         * @param since Since that many days, for example 7 gets all activities for last 7 days excluding today.
         */
        this.getRecentActivities = async (since) => {
            try {
                let after = moment().subtract(since, "days");
                let before = moment().subtract(1, "days");
                // Set after and before midnight.
                after
                    .hours(0)
                    .minutes(0)
                    .seconds(0);
                before
                    .hours(23)
                    .minutes(59)
                    .seconds(59);
                let query = {
                    after: after.unix(),
                    before: before.unix()
                };
                let result = await this.getActivities(query);
                return result;
            }
            catch (ex) {
                throw ex;
            }
        };
        // PAYMENT METHODS
        // --------------------------------------------------------------------------
        /**
         * Make a payment regarding the mileage of recent activities.
         */
        this.payForActivities = async () => {
            try {
                const paymentInterval = settings.strava.payments.interval;
                const since = paymentInterval == "weekly" ? 7 : 1;
                const activities = await this.getRecentActivities(since);
                const distance = _.sumBy(activities, "distance");
                const elevation = _.sumBy(activities, "elevation");
                const totalKm = distance + elevation / 1000;
                // Calculate total amount based on distance and elevation.
                const amount = (totalKm * settings.strava.payments.pricePerKm).toFixed(2);
                // Define payment options.
                const paymentOptions = {
                    amount: amount,
                    description: `Strava, ${distance}km ${paymentInterval}`,
                    toAlias: settings.bunq.accounts.strava,
                    reference: `strava-${moment().unix()}`
                };
                // Dispatch payment.
                await bunq.makePayment(paymentOptions);
                logger.info("Strava.makePayment", `Transferred ${amount} for ${totalKm}km`);
            }
            catch (ex) {
                logger.error("Strava.makePayment", ex);
            }
        };
    }
    static get Instance() {
        return this._instance || (this._instance = new this());
    }
    // INIT
    // --------------------------------------------------------------------------
    /**
     * Init the Strava module by setting up the payment timer.
     */
    async init() {
        if (!settings.strava.accessToken) {
            return logger.warn("Strava.init", "Missing settings.strava.accessToken, the Strava features won't be enabled.");
        }
        const paymentInterval = settings.strava.payments.interval;
        const msDay = 1000 * 60 * 60 * 24;
        const now = moment();
        const day = now.day();
        const target = moment(now.format("YYYY-MM-DD") + " " + settings.strava.payments.time);
        let diff;
        // Calculate how many days till next paymentm, if weekly.
        if (paymentInterval == "weekly") {
            if (day == 0) {
                target.add(1, "days");
            }
            else if (day > 1) {
                target.add(8 - day, "days");
            }
            diff = target.diff(now);
        }
        else if (paymentInterval == "daily") {
            diff = target.diff(now);
        }
        else {
            throw new Error(`Invalid payment interval: ${paymentInterval}, must be daily or weekly.`);
        }
        // If we're past the execution time, add 24 hours and subtract the difference.
        // The diff is already negative in this case, hence we do a + instead of - here.
        if (now.isAfter(target)) {
            diff = msDay + diff;
        }
        this.timerPay = setTimeout(this.payForActivities, diff);
        // Log successful init.
        const timeToNext = moment.duration(diff).humanize(true);
        logger.info("Strava.init", paymentInterval, `${settings.strava.payments.pricePerKm} EUR / km`, `Next: ${timeToNext}`);
    }
}
module.exports = Strava.Instance;

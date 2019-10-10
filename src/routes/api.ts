// API Routes

import {PaymentOptions, Payment} from "src/types"
import _ = require("lodash")
import bunq = require("../bunq")
import database = require("../database")
import logger = require("anyhow")
import moment = require("moment")
const app = require("expresser").app
const settings = require("setmeup").settings

const apiRoutes = {
    /** Get settings. */
    "get:api/settings": async (req, res) => {
        app.renderJson(req, res, settings)
    },

    /** Get bunq accounts. */
    "get:api/bunq/accounts": async (req, res) => {
        try {
            const accounts = await bunq.getAccounts()
            app.renderJson(req, res, accounts)
        } catch (ex) {
            app.renderError(req, res, ex)
        }
    },

    /** Reverse a payment made by Jarbunq. */
    "post:api/bunq/reverse-payment/:id/:date": async (req, res) => {
        try {
            const paymentId = parseInt(req.params.id)
            let findPayment = database.get("payments").find({id: paymentId})
            let payment: Payment = findPayment.value()

            // Payment not found? Stop here.
            if (payment == null) {
                return app.renderError(req, res, {error: "Payment not found"}, 404)
            }

            // Confirm date of payment.
            if (moment(payment.date).format("YYYY-MM-DD") != req.params.date) {
                return app.renderError(req, res, {error: "Invalid payment date"}, 404)
            }

            // Payment already reversed?
            if (payment.reverseId) {
                return app.renderError(req, res, {error: `Payment already reversed, ID ${payment.reverseId}`}, 400)
            }

            let paymentOptions = _.cloneDeep(payment) as PaymentOptions

            // Reverse the source and target accounts.
            const fromAlias = paymentOptions.toAlias
            const toAlias = paymentOptions.fromAlias
            paymentOptions.fromAlias = fromAlias
            paymentOptions.toAlias = toAlias

            // Append reversal note.
            const notes = (paymentOptions.notes as string[]) || []
            notes.unshift(`Reversal for payment ${paymentId}, ${req.params.date}`)
            paymentOptions.notes = notes

            // Make payment reversal.
            let reversePayment = await bunq.makePayment(paymentOptions)

            // Add reverse payment ID to the original.
            findPayment = database.get("payments").find({id: paymentId})
            findPayment.assign({reverseId: reversePayment.id}).write()

            app.renderJson(req, res, reversePayment)
        } catch (ex) {
            app.renderError(req, res, ex)
        }
    },

    /** Get data from database. */
    "get:api/*": async (req, res) => {
        const dbKey = req.params[0]

        if (!database.has(dbKey).value()) {
            return app.renderError(req, res, {error: "Not found"}, 404)
        }

        let limit: any = 50

        // Get limit from query, otherwise set default to 50.
        if (req.query.limit) {
            limit = req.query.limit
            delete req.query.limit
        }

        if (isNaN(limit)) {
            logger.warn(`Routes.api`, req.url, `Passed limit ${limit} is not a number, will default to 50`)
            limit = 50
        } else {
            limit = parseInt(limit)
        }

        // Helper function to filter data according to the passed query.
        const filter = d => {
            // Filter by date from?
            if (req.query.dateFrom != null) {
                if (moment(d.date).isBefore(moment(req.query.dateFrom).toDate())) {
                    return false
                }
                delete req.query.dateFrom
            }

            // Filter by date to?
            if (req.query.dateTo != null) {
                if (moment(d.date).isAfter(moment(req.query.dateTo).toDate())) {
                    return false
                }
                delete req.query.dateTo
            }

            // Iterate properties passed via query to match against the data.
            for (let [key, value] of Object.entries(req.query)) {
                if (key != "q" && d[key] == null) {
                    return false
                }

                let compareValue: string

                // Query "q" is generic and used to search all fields.
                if (key == "q") {
                    compareValue = JSON.stringify(d, null, 0)
                } else {
                    compareValue = _.isObject(d[key]) ? JSON.stringify(d[key], null, 0) : d[key].toString()
                }

                if (compareValue.indexOf(value.toString()) < 0) {
                    return false
                }
            }

            return true
        }

        // Return matching data.
        let data = database.get(dbKey).filter(filter)
        data = data.reverse().take(limit)

        app.renderJson(req, res, data.value())
    }
}

export = apiRoutes

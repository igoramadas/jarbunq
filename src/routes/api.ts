// API Routes

import _ = require("lodash")
import database = require("../database")
import logger = require("anyhow")
import moment = require("moment")
const app = require("expresser").app
const settings = require("setmeup").settings

const apiRoutes = {
    /** Get data from database. */
    "get/api/settings": async (req, res) => {
        app.renderJson(req, res, settings)
    },

    /** Get data from database. */
    "get/api/*": async (req, res) => {
        const dbKey = req.params[0]

        if (!database.has(dbKey).value()) {
            return app.renderError(req, res, {error: "Not found"}, 404)
        }

        // Get limit from query, otherwise set default to 50.
        let limit = req.query.limit ? req.query.limit : 50
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

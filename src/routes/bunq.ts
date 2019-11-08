// bunq Routes
// These routes are exclusively triggered by bunq, hence they are not
// under the default /api scope.

import bunq = require("../bunq")
import logger = require("anyhow")
import moment = require("moment")
const app = require("expresser").app

const bunqRoutes = {
    "get:bunq/auth": async (_req, res) => {
        res.redirect(bunq.authUrl)
    },

    /** OAuth2 redirect to process the code and get an access token. */
    "get:bunq/auth/callback": async (req, res) => {
        const code = req.query.code

        if (!code) {
            return res.redirect("/error?e=Missing authorization code from bunq")
        }

        const ok = await bunq.getOAuthToken(code)

        if (ok) {
            res.redirect("/login?success=1")
        } else {
            res.redirect("/error?e=OAuth2 flow failed")
        }
    },

    /** OAuth2 redirect to process the code and get an access token. */
    "post:bunq/notification/:accountId/:token": async (req, res) => {
        const data = req.body.NotificationUrl

        // Check if valid data was passed.
        if (!data) {
            logger.error(`Routes.bunqNotification`, req.params.accountId, "Invalid data")
            return app.renderError(req, res, {error: "Invalid data"}, 400)
        }

        // Check if pased token is valid.
        if (bunq.notificationUrlTokens.indexOf(req.params.token) < 0) {
            logger.error(`Routes.bunqNotification`, req.params.accountId, data.category, `Invalid URL token: ${req.params.token}`)
            return app.renderError(req, res, {error: "Invalid URL token"}, 401)
        }

        try {
            const eventType = Object.keys(data.object)[0]
            const objectData = data.object[eventType]

            // Get correct amounts.
            const amount = objectData.amount_billing ? objectData.amount_billing : objectData.amount_converted
            const originalAmount = objectData.amount_original_local ? objectData.amount_original_local : objectData.amount_local

            // Create notification object.
            const notification: BunqNotification = {
                id: objectData.id,
                category: data.category,
                description: objectData.description,
                amount: amount.value,
                currency: amount.currency,
                date: moment(objectData.updated).toDate()
            }

            // Check for additional fields.
            if (originalAmount) {
                notification.originalAmount = originalAmount.value
                notification.originalCurrency = originalAmount.currency
            }
            if (data.event_type) {
                notification.eventType = data.event_type
            }
            if (objectData.monetary_account_id) {
                notification.accountId = objectData.monetary_account_id
            }
            if (objectData.auto_save_entry && objectData.auto_save_entry.payment_savings) {
                notification.autoSavePaymentId = objectData.auto_save_entry.payment_savings.id
            }
            if (objectData.city) {
                notification.city = objectData.city
            }

            bunq.notification(notification)
        } catch (ex) {
            logger.error(`Routes.bunqNotification.${req.params.accountId}`, ex)
        }

        app.renderJson(req, res, {ok: true})
    }
}

export = bunqRoutes

// bunq Routes
// These routes are exclusively triggered by bunq, hence they are not
// under the default /api scope.

import bunq = require("../bunq")
import jaul = require("jaul")
import logger = require("anyhow")
import moment = require("moment")

const app = require("expresser").app
const settings = require("setmeup").settings

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
    "post:bunq/notification/:accountId/:category": async (req, res) => {
        const ip = jaul.network.getClientIP(req)
        const ipRange = settings.bunq.api.allowedCallbackIP
        const category = req.params.category

        // Check if sender is really bunq.
        if (ipRange && !jaul.network.ipInRange(ip, ipRange)) {
            logger.error("Route", "Access denied", req.method, req.url, `From ${ip}`)
            return res.status(401).json({error: "Access denied"})
        }

        // Process notification.
        try {
            const data = req.body.NotificationUrl
            data.category = data.category.toLowerCase()

            const eventType = Object.keys(data.object)[0]
            const objectData = data.object[eventType]

            // Confirm if notification category was the same as the provided via URL.
            if (category != data.category) {
                logger.warn(`Routes.bunqNotification.${category}`, req.params.accountId, eventType, `Notification body has a different category: ${data.category}`)
            }

            // Get correct amounts.
            const amount = objectData.amount_billing ? objectData.amount_billing : objectData.amount_converted
            const originalAmount = objectData.amount_original_local ? objectData.amount_original_local : objectData.amount_local

            // Create notification object.
            const notification: BunqNotification = {
                id: objectData.id,
                category: category,
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

            bunq.processNotification(notification)
        } catch (ex) {
            logger.error(`Routes.bunqNotification.${category}`, ex)
        }

        app.renderJson(req, res, {ok: true})
    }
}

export = bunqRoutes

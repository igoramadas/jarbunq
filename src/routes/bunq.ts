// bunq Routes
// These routes are exclusively triggered by bunq, hence they are not
// under the default /api scope.

import _ = require("lodash")
import bunq = require("../bunq")
import database = require("../database")
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
            await bunq.refreshUserData()
            res.redirect("/login?success=1")
        } else {
            res.redirect("/error?e=OAuth2 flow failed")
        }
    },

    /** OAuth2 redirect to process the code and get an access token. */
    "post:bunq/callback/:accountId": async (req, res) => {
        const data = req.body.NotificationUrl
        let notification: Partial<BunqCallback>

        // Check if valid data was passed.
        if (!data) {
            logger.error(`Routes.bunqCallback`, `Account: ${req.params.accountId}`, "Invalid data")
            return app.renderError(req, res, {error: "Invalid data"}, 400)
        }

        try {
            const notificationType = Object.keys(data.object)[0]
            const objectData = data.object[notificationType]

            // Get transaction amounts and description.
            const amount = objectData.amount || objectData.amount_billing || objectData.amount_local
            const description = objectData.description || objectData.merchant_reference

            // Create notification object.
            notification = {
                id: objectData.id,
                type: objectData.sub_type || notificationType.toUpperCase(),
                eventType: data.event_type || data.category,
                description: description,
                dateCreated: moment(objectData.created).toDate(),
                dateUpdated: moment(objectData.updated).toDate()
            }

            // Check for account details.
            if (objectData.monetary_account_id) {
                notification.accountId = objectData.monetary_account_id

                const findAccount = _.find(bunq.accounts, {id: objectData.monetary_account_id})
                if (findAccount) {
                    notification.accountName = findAccount.description
                }
            }

            // Check for amount.
            if (amount) {
                notification.amount = amount.value
                notification.currency = amount.currency
            }

            // Check for additional fields.
            if (objectData.amount_local) {
                notification.originalAmount = objectData.amount_local.value
                notification.originalCurrency = objectData.amount_local.currency
            } else if (objectData.amount_original_local) {
                notification.originalAmount = objectData.amount_original_local.value
                notification.originalCurrency = objectData.amount_original_local.currency
            }
            if (objectData.amount_fee) {
                notification.feeAmount = objectData.amount_fee.value
                notification.feeCurrency = objectData.amount_fee.currency
            }
            if (objectData.card_id) {
                notification.cardId = objectData.card_id
            }
            if (objectData.label_card) {
                if (objectData.label_card.type) {
                    notification.cardType = objectData.label_card.type
                }
                if (objectData.label_card.second_line) {
                    notification.cardLabel = objectData.label_card.second_line
                }
                if (objectData.label_card.label_primary_account_number) {
                    const cardAccount = objectData.label_card.label_primary_account_number

                    if (cardAccount.description) {
                        notification.cardLabel = cardAccount.description
                    }
                    if (cardAccount.last_four_digit) {
                        notification.card4Digits = cardAccount.last_four_digit
                    }
                }
            }
            if (objectData.status) {
                notification.status = objectData.status
            } else if (objectData.clearing_status) {
                notification.status = objectData.clearing_status
            }
            if (objectData.auto_save_entry && objectData.auto_save_entry.payment_savings) {
                notification.autoSavePaymentId = objectData.auto_save_entry.payment_savings.id
            }
            if (objectData.counterparty_alias) {
                notification.counterparty = objectData.counterparty_alias.display_name || objectData.counterparty_alias.iban
            }
            if (objectData.city) {
                notification.location = objectData.city
            }
        } catch (ex) {
            logger.error(`Routes.bunqCallback`, `Account: ${req.params.accountId}`, "Can't process notification", ex)
            notification.error = ex.toString()
        }

        // Process bunq callback and save to database.
        try {
            if (settings.bunq.callbacks.saveRaw) {
                notification.rawBody = data.object
            }

            database.insert("callbacks", notification)
            bunq.callback(notification as BunqCallback)
            app.renderJson(req, res, {ok: true})
        } catch (ex) {
            logger.error(`Routes.bunqCallback`, `Account: ${req.params.accountId}`, "Can't save notification", ex)
            app.renderJson(req, res, {ok: false})
        }
    }
}

export = bunqRoutes

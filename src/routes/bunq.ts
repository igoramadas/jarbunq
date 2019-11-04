// bunq Routes
// These routes are exclusively triggered by bunq, hence they are not
// under the default /api scope.

import bunq = require("../bunq")
import jaul = require("jaul")
import logger = require("anyhow")
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

        // Check if sender is really bunq.
        if (ipRange && !jaul.network.ipInRange(ip, ipRange)) {
            logger.error("Route", "Access denied", req.method, req.url, `From ${ip}`)
            return res.status(401).json({error: "Access denied"})
        }

        const category = req.params.category

        logger.info(`Routes.bunqNotification.${category}`, req.params.accountId, req.body)
        this.events.emit(`bunqNotification.${category}`, req.params.accountId, req.body)

        app.renderJson(req, res, {ok: true})
    }
}

export = bunqRoutes

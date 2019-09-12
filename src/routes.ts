// Routes

import _ = require("lodash")
import bunq = require("./bunq")
import database = require("./database")
import jaul = require("jaul")
import logger = require("anyhow")
import strava = require("./strava")
const settings = require("setmeup").settings

/**
 * This is a wrapper over bunq-js-client, and should have all the business
 * logic to handle notifications and transactions at bunq.
 */
class Routes extends require("./base-events") {
    private static _instance: Routes
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    // INIT AND HELPERS
    // --------------------------------------------------------------------------

    /**
     * Init the routes on the express app.
     */
    init = expressApp => {
        expressApp.use((req, res, next) => {
            const ext = req.url.substring(req.url.lengrh - 4)
            const ip = jaul.network.getClientIP(req)
            let allowedIP = settings.app.allowedIP || []

            // Bunq has its own allowed callback IPs?
            if (settings.bunq.api.allowedCallbackIP) {
                allowedIP.push(settings.bunq.api.allowedCallbackIP)
            }

            // Check if client is whitelisted.
            if (req.path.substring(0, 6) != "/error" && allowedIP.length > 0 && !jaul.network.ipInRange(ip, allowedIP)) {
                return this.sendAccessDenied(req, res)
            }

            // Log requests (ignore assets that have extensions).
            if (ext.indexOf(".") < 0) {
                logger.info("Route", req.method, req.path, `From ${ip}`)
            }

            next()
        })

        for (let key of Object.keys(this.definitions)) {
            const method = key.substring(0, key.indexOf("/"))
            const route = key.substring(key.indexOf("/"))
            expressApp[method](route, this.definitions[key])
        }
    }

    /**
     * Helper to send access denied to the client.
     * @param req The Express request object.
     * @param res The Express response object.
     */
    sendAccessDenied = (req, res) => {
        const ip = jaul.network.getClientIP(req)
        logger.error("Route", "Access denied", req.method, req.url, `From ${ip}`)
        return res.status(401).json({error: "Access denied"})
    }

    // ROUTE DEFINITIONS
    // --------------------------------------------------------------------------

    /**
     * Routes are defined using the format "method/route". So for instance
     * "get/dashboard" would be a GET request to /dashboard. All routes
     * should be defined as async functions.
     */
    definitions: any = {
        /** Index page, redirects to home or to login. */
        "get/": async (_req, res) => {
            if (bunq.authenticated) {
                res.redirect("/home")
            } else {
                res.redirect("/login")
            }
        },

        /** Homepage route. */
        "get/home": async (req, res) => {
            if (!bunq.authenticated) {
                res.redirect("/login")
            } else {
                req.vueOptions.head.title = "Home"
                res.renderVue("home.vue", {}, req.vueOptions)
            }
        },

        /** Homepage route. */
        "get/login": async (req, res) => {
            req.vueOptions.head.title = "Login"
            res.renderVue("login.vue", {}, req.vueOptions)
        },

        // BUNQ ROUTES
        // --------------------------------------------------------------------------

        /** Authentication route, used to start the OAuth2 auth flow. */
        "get/bunq/auth": async (_req, res) => {
            res.redirect(bunq.authUrl)
        },

        /** OAuth2 redirect to process the code and get an access token. */
        "get/bunq/auth/callback": async (req, res) => {
            const code = req.query.code

            if (!code) {
                return res.redirect("/error?e=Missing authorization code from bunq")
            }

            const ok = await bunq.getOAuthToken(code)

            if (ok) {
                res.redirect("/home")
            } else {
                res.redirect("/error?e=OAuth2 flow failed")
            }
        },

        /** OAuth2 redirect to process the code and get an access token. */
        "post/bunq/notifications/:accountId/:category": async (req, res) => {
            const ip = jaul.network.getClientIP(req)
            const ipRange = settings.bunq.api.allowedCallbackIP

            if (ipRange && !jaul.network.ipInRange(ip, ipRange)) {
                return this.sendAccessDenied(req, res)
            }

            logger.warn("Notifications NOT READY YET", req.params.accountId, req.params.category, req.body)
        },

        // STRAVA ROUTES
        // --------------------------------------------------------------------------

        /** Authentication route, used to start the OAuth2 auth flow with Strava. */
        "get/strava/auth": async (_req, res) => {
            res.redirect(strava.authUrl)
        },

        /** OAuth2 redirect to process the code and get an access token from Strava. */
        "get/strava/auth/callback": async (req, res) => {
            const code = req.query.code

            if (!code) {
                return res.redirect("/error?e=Missing authorization code from Strava")
            }

            const ok = await strava.getOAuthToken(code)

            if (ok) {
                res.redirect("/home")
            } else {
                res.redirect("/error?e=OAuth2 flow failed")
            }
        },

        /** Database view page. */
        "get/database": async (req, res) => {
            req.vueOptions.head.title = "Database"
            res.renderVue("database.vue", {jsonData: JSON.stringify(database.dump(true), null, 4)}, req.vueOptions)
        },

        /** Global error page, expects actual error message on the query "e". */
        "get/error": async (req, res) => {
            req.vueOptions.head.title = "Error"
            res.renderVue("error.vue", {message: req.query.e}, req.vueOptions)
        }
    }
}

// Init routes, bind catch-all processor.
// Exports...
Routes.export = Routes.Instance

// Routes

import bunq = require("./bunq")
import database = require("./database")
import logger = require("anyhow")
import strava = require("./strava")

/**
 * Routes are defined using the format "method/route". So for instance
 * "get/dashboard" would be a GET request to /dashboard. All routes
 * should be defined as async functions.
 */
let Routes = {
    /** Index page, redirects to home or to login. */
    "get/": async function(_req, res) {
        if (bunq.authenticated) {
            res.redirect("/home")
        } else {
            res.redirect("/login")
        }
    },

    /** Homepage route. */
    "get/home": async function(req, res) {
        if (!bunq.authenticated) {
            res.redirect("/login")
        } else {
            req.vueOptions.head.title = "Home"
            res.renderVue("home.vue", {}, req.vueOptions)
        }
    },

    /** Homepage route. */
    "get/login": async function(req, res) {
        req.vueOptions.head.title = "Login"
        res.renderVue("login.vue", {}, req.vueOptions)
    },

    // BUNQ ROUTES
    // --------------------------------------------------------------------------

    /** Authentication route, used to start the OAuth2 auth flow. */
    "get/bunq/auth": async function(_req, res) {
        res.redirect(bunq.authUrl)
    },

    /** OAuth2 redirect to process the code and get an access token. */
    "get/bunq/auth/callback": async function(req, res) {
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
    "post/bunq/notifications/:accountId/:category": async function(req, _res) {
        logger.warn("Notifications NOT READY YET", req.params.accountId, req.params.category, req.body)
    },

    // STRAVA ROUTES
    // --------------------------------------------------------------------------

    /** Authentication route, used to start the OAuth2 auth flow with Strava. */
    "get/strava/auth": async function(_req, res) {
        res.redirect(strava.authUrl)
    },

    /** OAuth2 redirect to process the code and get an access token from Strava. */
    "get/strava/auth/callback": async function(req, res) {
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
    "get/database": async function(req, res) {
        req.vueOptions.head.title = "Database"
        res.renderVue("database.vue", {jsonData: JSON.stringify(database.dump(true), null, 4)}, req.vueOptions)
    },

    /** Global error page, expects actual error message on the query "e". */
    "get/error": async function(req, res) {
        req.vueOptions.head.title = "Error"
        res.renderVue("error.vue", {message: req.query.e}, req.vueOptions)
    }
}

// Exports...
export = Routes

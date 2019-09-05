"use strict";
// Routes
const bunq = require("./bunq");
/**
 * Routes are defined using the format "method/route". So for instance
 * "get/dashboard" would be a GET request to /dashboard. All routes
 * should be defined as async functions.
 */
let Routes = {
    /** Index page, redirects to home or to login. */
    "get/": async function (_req, res) {
        if (bunq.authenticated) {
            res.redirect("/home");
        }
        else {
            res.redirect("/login");
        }
    },
    /** Homepage route. */
    "get/home": async function (req, res) {
        if (!bunq.authenticated) {
            res.redirect("/login");
        }
        else {
            req.vueOptions.head.title = "Home";
            res.renderVue("home.vue", {}, req.vueOptions);
        }
    },
    /** Homepage route. */
    "get/login": async function (req, res) {
        req.vueOptions.head.title = "Login";
        res.renderVue("login.vue", {}, req.vueOptions);
    },
    /** Authentication route, used to start the OAuth2 auth flow. */
    "get/auth": async function (_req, res) {
        res.redirect(bunq.authUrl);
    },
    /** OAuth2 redirect to process the code and get an access token. */
    "get/auth/callback": async function (req, res) {
        const code = req.query.code;
        if (!code) {
            return res.redirect("/error?e=Missing authorization code");
        }
        const ok = await bunq.getOAuthToken(code);
        if (ok) {
            res.redirect("/home");
        }
        else {
            res.redirect("/error?e=OAuth2 flow failed");
        }
    },
    /** History route. */
    "get/history": async function (req, res) {
        req.vueOptions.head.title = "History";
        res.renderVue("history.vue", {}, req.vueOptions);
    },
    /** Global error page, expects actual error message on the query "e". */
    "get/error": async function (req, res) {
        req.vueOptions.head.title = "Error";
        res.renderVue("error.vue", { message: req.query.e }, req.vueOptions);
    }
};
module.exports = Routes;

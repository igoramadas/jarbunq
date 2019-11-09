// Routes

import _ = require("lodash")
import bunq = require("./bunq")
import fs = require("fs")
import jaul = require("jaul")
import logger = require("anyhow")
import path = require("path")
const settings = require("setmeup").settings
const app = require("expresser").app

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
    init = () => {
        const ipWhitelistKeys = _.remove(Object.keys(settings.routes.ipWhitelist), "global")

        // Global logging and IP whitelist.
        app.expressApp.use((req, res, next) => {
            const ext = req.url.substring(req.url.length - 4)
            const ip = jaul.network.getClientIP(req)
            let allowedIP = settings.routes.ipWhitelist.global

            // IP whitelist is set?
            if (allowedIP) {
                if (_.isString(allowedIP)) {
                    allowedIP = [allowedIP]
                }

                // Check if client is whitelisted.
                if (req.path.substring(0, 6) != "/error" && !jaul.network.ipInRange(ip, allowedIP)) {
                    return this.sendAccessDenied(req, res)
                }
            }

            // DEPRECATED! Password now must be set on settings.app.auth.password.
            if (settings.app.adminPassword) {
                logger.warn("Routes.init", "DEPRECATED: settingss.app.adminPassword", "Please use settings.app.auth.password instead")

                // Make sure auth object is present on settings.
                if (settings.app.auth == null) {
                    settings.app.auth = {}
                }
                if (!settings.app.auth.password) {
                    settings.app.auth.password = settings.app.adminPassword
                }
            }

            // Password protect admin pages?
            if (settings.app.auth && settings.app.auth.password) {
                const unprotectedPaths = ["/error", "/bunq/notification"]

                // Home page and auth pages do not need to be password protected.
                for (let p of unprotectedPaths) {
                    if (req.url.substring(0, p.length) == p) {
                        return next()
                    }
                }

                const auth = {username: settings.app.auth.user || "admin", password: settings.app.auth.password}
                const b64auth = (req.headers.authorization || "").split(" ")[1] || ""
                const arrBuffer = Buffer.from(b64auth, "base64").toString()
                const [username, password] = arrBuffer.split(":")

                if (username && password && username == auth.username && password == auth.password) {
                    return next()
                }

                // Send access denied if password didn't match.
                logger.warn("Route", req.method, req.url, "Access denied, wrong password", `From ${ip}`)
                res.set("WWW-Authenticate", 'Basic realm="401"')
                return res.status(401).send("Authentication required.")
            } else {
                logger.warn("Routes.init", "No password set on settings.app.auth.password", "This is a security risk, please set the admin password!")
            }

            // Log requests (ignore assets that have extensions).
            if (ext.indexOf(".") < 0) {
                logger.info("Route", req.method, req.url, `From ${ip}`)
            }

            next()
        })

        // IP whitelisting to specific routes.
        if (ipWhitelistKeys.length > 0) {
            for (let route of ipWhitelistKeys) {
                app.expressApp.use(route, (req, res, next) => {
                    const ip = jaul.network.getClientIP(req)
                    let allowedIP = settings.routes.ipWhitelist[route]

                    if (_.isString(allowedIP)) {
                        allowedIP = [allowedIP]
                    }

                    // Check if client is whitelisted for that specific route.
                    if (!jaul.network.ipInRange(ip, allowedIP)) {
                        return this.sendAccessDenied(req, res)
                    }

                    next()
                })
            }
        }

        // Bind routes from /routes folder.
        const routerFiles = fs.readdirSync(path.join(__dirname, "routes"))
        for (let file of routerFiles) {
            if (path.extname(file) == ".js") {
                const routerDefinitions = require("./routes/" + file)

                for (let key of Object.keys(routerDefinitions)) {
                    const method = key.substring(0, key.indexOf(":"))
                    const route = "/" + key.substring(key.indexOf(":") + 1)

                    if (app.expressApp[method]) {
                        app.expressApp[method](route, routerDefinitions[key])
                    }
                }
            }
        }

        // Default route for home.
        app.expressApp.get("/", (req, res) => {
            if (!bunq.authenticated) {
                res.redirect("/login")
            } else {
                const files = fs.readdirSync(path.join(__dirname, "../", "assets/scripts/components"))
                const options = {nodeEnv: process.env.NODE_ENV, components: files}
                app.renderView(req, res, "index.pug", options)
            }
        })
    }

    /**
     * Helper to send access denied to the client.
     * @param req The Express request object.
     * @param res The Express response object.
     */
    sendAccessDenied = (req, res) => {
        const ip = jaul.network.getClientIP(req)
        logger.error("Route", "Access denied", req.method, req.url, `From ${ip}`)
        return res.status(401).json({error: `Access denied (${ip})`})
    }
}

// Exports...
export = Routes.Instance

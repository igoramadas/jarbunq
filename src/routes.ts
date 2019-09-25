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
        app.expressApp.use((req, res, next) => {
            const ext = req.url.substring(req.url.lengrh - 4)
            const ip = jaul.network.getClientIP(req)
            let allowedIP = settings.app.allowedIP || []
            allowedIP = _.cloneDeep(allowedIP)

            // Bunq has its own allowed callback IPs?
            if (settings.bunq.api.allowedCallbackIP) {
                allowedIP.push(settings.bunq.api.allowedCallbackIP)
            }

            // Check if client is whitelisted.
            if (req.path.substring(0, 6) != "/error" && settings.app.allowedIP.length > 0 && !jaul.network.ipInRange(ip, allowedIP)) {
                return this.sendAccessDenied(req, res)
            }

            // Log requests (ignore assets that have extensions).
            if (ext.indexOf(".") < 0) {
                logger.info("Route", req.method, req.url, `From ${ip}`)
            }

            next()
        })

        // Bind route definitions.
        for (let key of Object.keys(this.definitions)) {
            const method = key.substring(0, key.indexOf("/"))
            const route = key.substring(key.indexOf("/"))
            app.expressApp[method](route, this.definitions[key])
        }

        // Bind routes from /routes folder.
        const routerFiles = fs.readdirSync(path.join(__dirname, "routes"))
        for (let file of routerFiles) {
            if (path.extname(file) == ".js") {
                const routerDefinitions = require("./routes/" + file)

                for (let key of Object.keys(routerDefinitions)) {
                    const method = key.substring(0, key.indexOf("/"))
                    const route = key.substring(key.indexOf("/"))
                    app.expressApp[method](route, routerDefinitions[key])
                }
            }
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
        "get/": async (req, res) => {
            if (!bunq.authenticated) {
                res.redirect("/login")
            } else {
                const files = fs.readdirSync(path.join(__dirname, "../", "assets/scripts/components"))
                const options = {nodeEnv: process.env.NODE_ENV, components: files}
                app.renderView(req, res, "index.pug", options)
            }
        }
    }
}

// Exports...
export = Routes.Instance

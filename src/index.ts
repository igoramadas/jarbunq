// Index

import fs = require("fs")
import path = require("path")

// Env is "development" by default.
if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = "development"
}

let startup = async function() {
    // Setup logger.
    const logger = require("anyhow")
    logger.setup("console")
    logger.levelOnConsole = true
    logger.uncaughtExceptions = true
    logger.unhandledRejections = true

    // Load settings.
    const setmeup = require("setmeup")
    setmeup.load()
    setmeup.load("settings.private.json")
    const settings = setmeup.settings

    // Replicate app name on the Logger.
    logger.appName = settings.app.title

    // Load and start Expresser.
    const expresser = require("expresser")
    const app = expresser.app
    app.init()

    // Load Vue options.
    const bodyFile = path.join(__dirname, "../", "assets", "vue", "template.html")
    const bodyTemplate = fs.readFileSync(bodyFile, {encoding: settings.general.encoding as string})
    const bodyTag = "{{ CONTENTS }}"
    const bodyTagIndex = bodyTemplate.indexOf(bodyTag)
    const vueOptions = {
        pagesPath: path.join(__dirname, "../", "assets", "vue"),
        head: {
            metas: [{name: "viewport", content: "width=device-width, initial-scale=1"}],
            styles: [{style: "styles/bulma.min.css"}, {style: "styles/main.css"}]
        },
        template: {
            body: {
                start: bodyTemplate.substring(0, bodyTagIndex),
                end: bodyTemplate.substring(bodyTagIndex + bodyTag.length)
            }
        }
    }

    // Register express-vue.
    const expressVue = require("express-vue")
    await expressVue.use(app.expressApp, vueOptions)

    // Setup routes.
    const routes = require("./routes")
    routes.init(app.expressApp)

    // Init the database.
    const database = require("./database")
    await database.init()

    // Init the notifications handler.
    const notifications = require("./notifications")
    await notifications.init()

    // Init webhooks.
    const webhooks = require("./webhooks")
    await webhooks.init()

    // Bunq client wrapper.
    const bunq = require("./bunq")

    // Debug enabled? Log axios calls and bunq client requests.
    if (settings.general.debug) {
        require("axios-debug-log")({
            error: function(_debug, error) {
                logger.error("Index.axios", error.response.data)
            }
        })

        require("loglevel").setLevel("trace")
        process.env.BUNQ_JS_CLIENT_LOG_LEVEL = "trace"
    } else {
        require("loglevel").setLevel("warn")
        process.env.BUNQ_JS_CLIENT_LOG_LEVEL = "warn"
    }

    // Start the bunq wrapper.
    await bunq.init()

    // Start the email manager.
    const emailManager = require("./email-manager")
    await emailManager.init()

    // Start the Strava wrapper.
    const strava = require("./strava")
    await strava.init()

    // Users can extend Jarbunq by creating a plugins file
    // that will be loaded here.
    const pluginsFile = path.join(__dirname, "plugins.js")
    if (fs.existsSync(pluginsFile)) {
        require("./plugins.js")
    }

    // Gracefully shutdown.
    process.on("SIGTERM", () => {
        logger.warn(settings.app.title, "shutdown", "The server will shutdown now...")

        expresser.app.kill()
        emailManager.stop()
        strava.stop()
    })
}

// Start the server!
startup()

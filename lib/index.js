// Index
const fs = require("fs");
const jaul = require("jaul");
const path = require("path");
// Env is "development" by default.
if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = "development";
}
let startup = async function () {
    // Setup logger.
    const logger = require("anyhow");
    logger.setup("console");
    logger.levelOnConsole = true;
    // Load settings.
    const setmeup = require("setmeup");
    setmeup.load();
    setmeup.load("settings.private.json");
    const settings = setmeup.settings;
    // Load and start Expresser.
    const expresser = require("expresser");
    const app = expresser.app;
    app.init();
    // Load Vue options.
    const bodyFile = path.join(__dirname, "../", "assets", "vue", "template.html");
    const bodyTemplate = fs.readFileSync(bodyFile, { encoding: settings.general.encoding });
    const bodyTag = "{{ CONTENTS }}";
    const bodyTagIndex = bodyTemplate.indexOf(bodyTag);
    const vueOptions = {
        pagesPath: path.join(__dirname, "../", "assets", "vue"),
        head: {
            metas: [{ name: "viewport", content: "width=device-width, initial-scale=1" }],
            styles: [{ style: "styles/bulma.min.css" }, { style: "styles/main.css" }]
        },
        template: {
            body: {
                start: bodyTemplate.substring(0, bodyTagIndex),
                end: bodyTemplate.substring(bodyTagIndex + bodyTag.length)
            }
        }
    };
    // Register express-vue.
    const expressVue = require("express-vue");
    await expressVue.use(app.expressApp, vueOptions);
    // Catch all route to pre-process requests.
    app.expressApp.use((req, res, next) => {
        const ext = req.url.substring(req.url.lengrh - 4);
        const ip = jaul.network.getClientIP(req);
        if (settings.app.allowedIP && settings.app.allowedIP.length > 0 && settings.app.allowedIP.indexOf(ip) < 0) {
            logger.warn("Route", "Access denied", req.method, req.url, `From ${ip}`);
            res.redirect("/error?e=Access denied");
            return;
        }
        if (ext.indexOf(".") < 0) {
            logger.info("Route", req.method, req.url, `From ${ip}`);
        }
        next();
    });
    // Setup routes.
    const routes = require("./routes");
    for (let key of Object.keys(routes)) {
        const method = key.substring(0, key.indexOf("/"));
        const route = key.substring(key.indexOf("/"));
        app[method](route, routes[key]);
    }
    // Init the database.
    const database = require("./database");
    await database.init();
    // Init the notifications handler.
    const notifications = require("./notifications");
    await notifications.init();
    // Bunq client wrapper.
    const bunq = require("./bunq");
    // Start the email manager.
    const emailManager = require("./email-manager");
    await emailManager.init();
    // Start the Strava wrapper.
    const strava = require("./strava");
    await strava.init();
    // Users can extend Jarbunq by creating a plugins file
    // that will be loaded here.
    const pluginsFile = path.join(__dirname, "plugins.js");
    if (fs.existsSync(pluginsFile)) {
        require("./plugins.js");
    }
    // Debug enabled? Log axios calls and bunq client requests.
    if (settings.general.debug) {
        require("axios-debug-log")({
            error: function (_debug, error) {
                logger.error("Index.axios", error.response.data);
            }
        });
        require("loglevel").setLevel("trace");
        process.env.BUNQ_JS_CLIENT_LOG_LEVEL = "trace";
    }
    else {
        require("loglevel").setLevel("warn");
        process.env.BUNQ_JS_CLIENT_LOG_LEVEL = "warn";
    }
    // Start the bunq wrapper.
    await bunq.init();
    // Gracefully shutdown.
    process.on("SIGTERM", () => {
        logger.warn("Shutdown", `The ${settings.app.title} will shutdown now...`);
        emailManager.stop();
        strava.stop();
        expresser.app.kill();
    });
};
// Start the server!
startup();

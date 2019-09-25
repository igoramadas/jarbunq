// Views Routes

const app = require("expresser").app

const viewsRoutes = {
    /** Homepage route. */
    "get/login": async (req, res) => {
        req.vueOptions.head.title = "Login"
        res.renderVue("login.vue", {}, req.vueOptions)
    },

    /** Global error page, expects actual error message on the query "e". */
    "get/error": async (req, res) => {
        req.vueOptions.head.title = "Error"
        res.renderVue("error.vue", {message: req.query.e}, req.vueOptions)
    },

    /** Load Vue view / component template. */
    "get/view/*": async (req, res) => {
        app.renderView(req, res, `${req.params[0]}.pug`)
    }
}

export = viewsRoutes

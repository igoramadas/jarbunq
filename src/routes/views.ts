// Views Routes

const app = require("expresser").app
const settings = require("setmeup").settings

const renderView = (req: any, res: any, view: string, options?: any) => {
    options = options || {}
    options.appTitle = settings.app.title
    app.renderView(req, res, view, options)
}

const viewsRoutes = {
    /** Homepage route. */
    "get/login": async (req, res) => {
        renderView(req, res, "login.pug", {success: req.query.success})
    },

    /** Global error page, expects actual error message on the query "e". */
    "get/error": async (req, res) => {
        renderView(req, res, "error.pug", {message: req.query.e})
    },

    /** Load Vue view / component template. */
    "get/view/*": async (req, res) => {
        renderView(req, res, `components/${req.params[0]}.pug`)
    }
}

export = viewsRoutes

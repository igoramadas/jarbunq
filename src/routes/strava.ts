// Strava Routes

import strava = require("../strava")

const stravaRoutes = {
    /** Redirect to Strava login. */
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
    }
}

export = stravaRoutes

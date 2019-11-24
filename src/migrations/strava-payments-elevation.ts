// Update Strava payments to rename totalKm for distance

import database = require("../database")

let Migration = {
    deadline: "2019-11-30",

    // Migration code.
    run: async () => {
        let counter = 0
        let stravaPayments = database.get("stravaPayments").value()
        let iterator = function(p) {
            if (!p.distance) {
                p.distance = p.totalKm
                delete p.totalKm
                counter++
            }
        }

        // Iterate and update distance fields.
        stravaPayments.forEach(iterator)

        // Save DB.
        database.db.write()

        if (counter > 0) {
            return `Renamed totalKm to distance on ${counter} strava payments`
        }

        return null
    }
}

export = Migration

// Update bunqTokenDate to jsClient.tokenTimestamp

import database = require("../database")
import moment = require("moment")

let Migration = {
    deadline: "2019-09-21",

    // Migration code.
    run: async () => {
        let tokenDate = database.get("bunqTokenDate").value()

        if (tokenDate) {
            let timestamp = moment(new Date(tokenDate)).unix()
            database.unset("bunqTokenDate").write()
            database.set("jsClient.tokenTimestamp", timestamp).write()

            return `Updated token date to timestamp: ${timestamp}`
        }

        return null
    }
}

export = Migration

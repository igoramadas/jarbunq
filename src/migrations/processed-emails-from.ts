// Update processed emails from field to remove its HTML values

import database = require("../database")
import logger = require("anyhow")

let Migration = {
    deadline: "2019-09-25",

    // Migration code.
    run: async () => {
        let processedEmails = database.get("processedEmails").value()
        let iterator = function(p) {
            if (p.from.value && p.from.value.length > 0) {
                p.from = p.from.value[0].address.toLowerCase()
                logger.info("Database.migrations", p.messageId, `Updated from to ${p.from}`)
            }
        }

        // Iterate and update "from" fields.
        processedEmails.forEach(iterator)

        // Save DB.
        database.db.write()
    }
}

export = Migration

// Update processed emails from field to remove its HTML values

import database = require("../database")

let Migration = {
    deadline: "2019-09-20",

    // Migration code.
    run: async () => {
        let counter = 0
        let processedEmails = database.get("processedEmails").value()
        let iterator = function(p) {
            if (p.from.value && p.from.value.length > 0) {
                p.from = p.from.value[0].address.toLowerCase()
                counter++
            }
        }

        // Iterate and update "from" fields.
        processedEmails.forEach(iterator)

        // Save DB.
        database.db.write()

        return `Updated from address on ${counter} email messages`
    }
}

export = Migration

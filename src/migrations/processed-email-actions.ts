// Set missing processed email actions and eliminate duplicates.

import database = require("../database")

let Migration = {
    deadline: "2019-09-27",

    // Migration code.
    run: async () => {
        let counter = 0
        let processedEmails = database.get("processedEmails")
        processedEmails = processedEmails.uniqBy("messageId").value()

        let iterator = function(p) {
            p.actions = {}

            if (p.subject.indexOf("Amazon.de order") > 0) {
                p.actions["amazon-de"] = true
                counter++
            }
        }

        // Iterate and update "from" fields.
        processedEmails.forEach(iterator)

        // Save DB.
        database.set("processedEmails", processedEmails).write()

        if (counter > 0) {
            return `Updated action on ${counter} email messages`
        }

        return null
    }
}

export = Migration

class EmailsView extends jarbunq.BaseView {
    viewId = "emails"

    main = {
        created: async function() {
            this.fetchEmails()
        },

        methods: {
            fetchEmails: async function() {
                try {
                    if (this.inputSearch.trim() == "") {
                        this.emails = await apiFetchData("processedEmails")
                    } else {
                        this.emails = await apiFetchData(`processedEmails?q=${this.inputSearch}`)
                    }
                } catch (ex) {
                    console.error("Can't fetch emails", ex)
                }
            },

            fetchEmailsDelay: _.debounce(function() {
                this.fetchEmails()
            }, jarbunq.inputDebounce)
        },

        data: {
            inputSearch: "",
            emails: []
        }
    }
}

window.jarbunq.views.push(new EmailsView())

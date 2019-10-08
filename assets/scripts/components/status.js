class StatusView extends jarbunq.BaseView {
    viewId = "status"

    main = {
        mounted: async function() {
            this.accounts = await apiFetchData("bunq/accounts")
            jarbunq.accounts = this.accounts

            this.recentPayments = await apiFetchData("payments?limit=3")
            this.recentEmails = await apiFetchData("processedEmails?limit=3")
        },

        data: {
            accounts: [],
            recentPayments: [],
            recentEmails: []
        }
    }
}

window.jarbunq.views.push(new StatusView())

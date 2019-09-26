class StravaView extends jarbunq.BaseView {
    viewId = "strava"
    viewRoutes = [{path: ":id", component: "detail"}]

    main = {
        created: async function() {
            this.fetchPayments()
        },

        methods: {
            fetchPayments: async function() {
                try {
                    if (this.inputSearch.trim() == "") {
                        this.stravaPayments = await apiFetchData("stravaPayments")
                    } else {
                        this.stravaPayments = await apiFetchData(`stravaPayments?q=${this.inputSearch}`)
                    }
                } catch (ex) {
                    console.error("Can't fetch Strava payments", ex)
                }
            },

            fetchPaymentsDelay: _.debounce(function() {
                this.fetchPayments()
            }, jarbunq.inputDebounce)
        },

        data: {
            inputSearch: "",
            stravaPayments: []
        }
    }
}

window.jarbunq.views.push(new StravaView())

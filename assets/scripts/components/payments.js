class PaymentsView extends jarbunq.BaseView {
    viewId = "payments"
    viewRoutes = [{path: ":id", component: "detail"}]

    main = {
        created: async function() {
            this.fetchPayments()
        },

        methods: {
            fetchPayments: async function() {
                try {
                    if (this.inputSearch.trim() == "") {
                        this.payments = await apiFetchData("payments")
                    } else {
                        this.payments = await apiFetchData(`payments?q=${this.inputSearch}`)
                    }
                } catch (ex) {
                    console.error("Can't fetch payments", ex)
                }
            },

            fetchPaymentsDelay: _.debounce(function() {
                this.fetchPayments()
            }, jarbunq.inputDebounce)
        },

        data: {
            inputSearch: "",
            payments: []
        }
    }
}

window.jarbunq.views.push(new PaymentsView())

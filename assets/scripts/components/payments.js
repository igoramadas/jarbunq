class PaymentsView extends jarbunq.BaseView {
    viewId = "payments"
    viewRoutes = [{path: ":id", component: "detail"}]

    main = {
        created: async function() {
            try {
                this.payments = await apiFetchData("payments")
            } catch (ex) {
                logger.error(ex)
            }
        },

        data: {
            payments: []
        }
    }
}

window.jarbunq.views.push(new PaymentsView())

class PaymentsView extends jarbunq.BaseView {
    viewId = "payments"
    viewRoutes = [{path: ":id", component: "detail"}]

    main = {
        created: async () => {
            try {
                this.payments = await apiFetchData("payments")
                console.dir(this.payments)
            } catch (ex) {
                logger.error(ex)
            }
        },

        data: {
            payments: null
        }
    }
}

window.jarbunq.views.push(new PaymentsView())

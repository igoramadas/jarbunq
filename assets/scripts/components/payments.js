class PaymentsView extends jarbunq.BaseView {
    viewId = "payments"
    viewRoutes = [{path: ":id", component: "detail"}]

    main = {
        created() {
            console.warn(123)
        },

        data: {
            payments: 0
        }
    }
}

window.jarbunq.views.push(new PaymentsView())

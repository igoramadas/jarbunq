class StatusView extends jarbunq.BaseView {
    viewId = "status"
    viewRoutes = [{path: ":id", component: "detail"}]

    main = {
        created: () => {
            console.warn(123)
        },

        data: {
            payments: 0
        }
    }
}

window.jarbunq.views.push(new StatusView())

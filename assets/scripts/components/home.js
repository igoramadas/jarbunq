class HomeView extends jarbunq.BaseView {
    viewId = "home"
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

window.jarbunq.views.push(new HomeView())

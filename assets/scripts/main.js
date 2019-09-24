

const jarbunqInit = function() {
    const jarbunq = window.jarbunq

    jarbunq.routes.push({path: "/", redirect: "/home"})
    jarbunq.router = new VueRouter({routes: jarbunq.routes})
    jarbunq.app = new Vue({router: jarbunq.router, data: {error: null, pageTitle: ""}})
    jarbunq.app.$mount("#app")
}

jarbunqInit()

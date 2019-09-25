window.jarbunq = {
    routes: [],
    views: []
}

// Helper to fetch API (mostly database) data from Jarbunq.
window.apiFetchData = async url => {
    try {
        const response = await axios.get(`/api/${url}`)
        return response.data
    } catch (ex) {
        console.error(`Can't fetch ${url}`, ex)
        throw ex
    }
}

window.jarbunqInit = async function() {
    const jarbunq = window.jarbunq

    // Not on index page? Then do not load Vue.
    if (document.location.pathname != "/") {
        return
    }

    for (let view of jarbunq.views) {
        await view.init()
    }

    jarbunq.routes.push({path: "/", redirect: "/status"})
    jarbunq.router = new VueRouter({routes: jarbunq.routes, linkActiveClass: "is-active"})
    jarbunq.app = new Vue({router: jarbunq.router, data: {error: null, pageTitle: ""}})
    jarbunq.app.$mount("#app")
}

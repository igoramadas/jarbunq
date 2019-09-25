window.apiFetchData = async url => {
    try {
        const response = await axios.get(`/api/${url}`)
        return response.data
    } catch (ex) {
        console.error(`Can't fetch ${url}`, ex)
        throw ex
    }
}

const jarbunqInit = async function() {
    const jarbunq = window.jarbunq

    for (let view of jarbunq.views) {
        await view.init()
    }

    jarbunq.routes.push({path: "/", redirect: "/status"})
    jarbunq.router = new VueRouter({routes: jarbunq.routes})
    jarbunq.app = new Vue({router: jarbunq.router, data: {error: null, pageTitle: ""}})
    jarbunq.app.$mount("#app")
}

jarbunqInit()

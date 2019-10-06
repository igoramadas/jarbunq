window.jarbunq = {
    routes: [],
    views: [],
    inputDebounce: 400
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
        console.log("Vue was not loaded")
        return
    }

    for (let view of jarbunq.views) {
        await view.init()
    }

    // Init router.
    jarbunq.routes.push({path: "/", redirect: "/status"})
    jarbunq.router = new VueRouter({routes: jarbunq.routes, linkActiveClass: "is-active"})
    jarbunq.app = new Vue({router: jarbunq.router, data: {error: null, pageTitle: ""}})
    jarbunq.app.$mount("#app")

    // Top nav menu.
    const $navbarBurgers = Array.prototype.slice.call(document.querySelectorAll(".navbar-burger"), 0)
    $navbarBurgers.forEach(el => {
        el.addEventListener("click", () => {
            const $target = document.getElementById("navbar-links")
            el.classList.toggle("is-active")
            $target.classList.toggle("is-active")
        })
    })
}

window.jarbunq = {
    inputDebounce: 400,
    shortDateTimeFormat: "DD/MM HH:MM",

    routes: [],
    views: [],
    accounts: [],

    getAccountFromAlias: function(alias) {
        const acc = _.find(this.accounts, a => {
            return _.find(a.alias, {value: alias}) != null
        })

        if (acc != null) {
            return acc.description
        }

        return alias
    }
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

    jarbunq.accounts = await apiFetchData("bunq/accounts")

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
    const $navbarLinksWrapper = document.getElementById("navbar-links")
    const $navbarBurgers = Array.prototype.slice.call(document.querySelectorAll(".navbar-burger"), 0)
    $navbarBurgers.forEach(el => {
        el.addEventListener("click", () => {
            el.classList.toggle("is-active")
            $navbarLinksWrapper.classList.toggle("is-active")
        })
    })

    const $navbarLinks = Array.prototype.slice.call(document.querySelectorAll("a.navbar-item"), 0)
    $navbarLinks.forEach(el => {
        el.addEventListener("click", () => {
            $navbarBurgers[0].classList.toggle("is-active")
            $navbarLinksWrapper.classList.toggle("is-active")
        })
    })
}

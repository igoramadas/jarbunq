class BaseView {
    init = async () => {
        jarbunq.routes.push({path: `/${this.viewId}`, component: await this.createComponent("main")})
    }

    // Helper to create a Vue component (view).
    createComponent = async compId => {
        let filename = this.viewId
        if (compId !== "main") {
            filename += `.${compId}`
        }

        try {
            const response = await axios.get(`/view/${filename}`)
            const component = {
                template: response.data,
                methods: this[compId].methods || {},
                created: this[compId].created,
                data: () => {
                    return this[compId].data
                }
            }

            if (this[compId].mounted) {
                component.mounted = this[compId].mounted
            }

            if (this[compId].beforeDestroy) {
                component.beforeDestroy = this[compId].beforeDestroy
            }

            return component
        } catch (ex) {
            console.error(ex)
            return {message: `Could not load template for ${this.viewId}`}
        }
    }

    // Helper to set page title.
    pageTitle = value => {
        document.title = `Jarbunq: ${value}`
    }
}

window.jarbunq.BaseView = BaseView

class SettingsView extends jarbunq.BaseView {
    viewId = "settings"

    main = {
        created: async function() {},

        mounted: async function() {
            if (this.jsonEditor == null) {
                const container = document.getElementById("settings-editor")
                const options = {
                    mode: "form",
                    modes: ["form", "tree"]
                }

                this.jsonEditor = new JSONEditor(container, options)
            }

            try {
                this.settingsJson = await apiFetchData("settings")
                this.jsonEditor.set(this.settingsJson)
            } catch (ex) {
                console.error(ex)
            }
        },

        data: {
            settingsJson: null
        }
    }
}

window.jarbunq.views.push(new SettingsView())

// Eventhooks

import logger = require("anyhow")
import request = require("request-promise-native")
const settings = require("setmeup").settings

/**
 * Central management of eventhooks.
 */
class Eventhooks {
    private static _instance: Eventhooks
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    // PROPERTIES
    // --------------------------------------------------------------------------

    /** Holds a copy of all registered eventhook listeners. */
    listeners: any[] = []

    // MAIN METHODS
    // --------------------------------------------------------------------------

    /**
     * Init the eventhooks handler by loading them from settings.
     */
    async init() {
        this.load()
    }

    // EVENTHOOKS
    // --------------------------------------------------------------------------

    /**
     * Load eventhooks defined on the settings.
     */
    load = () => {
        if (this.listeners.length > 0) {
            logger.info("Eventhooks.load", `Stopping ${this.listeners.length} registered eventhooks before reload`)

            for (let cb of this.listeners) {
                try {
                    require(`./${cb.module}`).off(cb.key, cb.method)
                } catch (ex) {
                    logger.error("Eventhooks.load", cb.module, cb.key, "Can't unbind", ex)
                }
            }
        }

        // Reset listeners.
        this.listeners = []

        // Each subkey of the eventhooks on settings represent a module.
        const moduleIds = Object.keys(settings.eventhooks)

        // Iterate modules, function names and eventhook definitions.
        for (let id of moduleIds) {
            try {
                let obj = require(`./${id}`)
                let moduleEvents = settings.eventhooks[id]
                let eventNames = Object.keys(moduleEvents)

                for (let evt of eventNames) {
                    for (let eventhook of moduleEvents[evt]) {
                        const createCallback = (moduleId, name, hook) => {
                            return async function() {
                                logger.debug("Eventhooks.load", moduleId, name, hook)
                            }
                        }

                        // Create callback and set listener.
                        const callback = createCallback(id, evt, eventhook)
                        obj.on(evt, callback)
                        this.listeners.push(callback)
                    }
                }
            } catch (ex) {
                logger.error("Eventhooks.load", id, ex)
            }
        }

        logger.info("Eventhooks.load", `Loaded ${this.listeners.length} eventhooks`)
    }
}

// Exports...
export = Eventhooks.Instance

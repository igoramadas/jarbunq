// Eventhooks

import _ = require("lodash")
import bunq = require("./bunq")
import logger = require("anyhow")
import notifications = require("./notifications")
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

    // INIT AND LOADING
    // --------------------------------------------------------------------------

    /**
     * Init the eventhooks handler by loading them from settings.
     */
    async init() {
        this.load()

        // DEPRECATED! Webhooks are now Eventhooks.
        if (settings.webhooks) {
            logger.warn("Eventhooks.init", "Webhooks are not Eventhooks! Please migrate your webhooks definitions to eventhooks with url actions.")
        }
    }

    /**
     * Load eventhooks defined on the settings.
     */
    load = () => {
        if (this.listeners.length > 0) {
            logger.info("Eventhooks.load", `Stopping ${this.listeners.length} registered eventhooks before reload`)

            for (let cb of this.listeners) {
                try {
                    require(`./${cb.module}`).off(cb.eventName, cb.callback)
                } catch (ex) {
                    logger.error("Eventhooks.load", cb.module, cb.eventName, "Can't unbind", ex)
                }
            }
        }

        // Reset listeners.
        this.listeners = []

        // Each subkey of the eventhooks on settings represent a moduleId.eventName.
        const moduleEvents = Object.keys(settings.eventhooks)

        // Iterate modules, function names and eventhook definitions.
        for (let me of moduleEvents) {
            try {
                const sep = me.indexOf(".")
                const moduleId = me.substring(0, sep)
                const eventName = me.substring(sep + 1)
                let eventhook: EventhookOptions

                // Load the specified module.
                let obj = require(`./${moduleId}`)

                // Iterate the specified eventooks.
                for (eventhook of settings.eventhooks[me]) {
                    const createCallback = (m, e, hook) => {
                        return async (...args) => {
                            logger.debug("Eventhooks.load", m, e)
                            await this.processEvent(hook, args)
                        }
                    }

                    // Create callback and set listener.
                    const callback = createCallback(moduleId, eventName, eventhook)
                    obj.on(eventName, callback)

                    // Add to list of active listeners.
                    this.listeners.push({
                        module: moduleId,
                        eventName: eventName,
                        callback: callback
                    })
                }
            } catch (ex) {
                logger.error("Eventhooks.load", me, ex)
            }
        }

        logger.info("Eventhooks.load", `Loaded ${this.listeners.length} eventhooks`)
    }

    // EVENTHOOKS
    // --------------------------------------------------------------------------

    /**
     * Process an event. Check if it matches the specified conditions,
     * and if so, execute the defined actions.
     * @param eventhook The eventhook definition.
     * @param args Arguments passed with the event.
     */
    processEvent = async (eventhook: EventhookOptions, args: any) => {
        for (let data of args) {
            for (let [key, value] of Object.entries(eventhook.data)) {
                if (typeof data[key] == "undefined" || data[key].indexOf(value) < 0) {
                    data = null
                    continue
                }
            }

            // Stop here if no matches were found.
            if (data == null) {
                return
            }

            // Always treat actions as arrays.
            const actions = _.isArray(eventhook.actions) ? eventhook.actions : [eventhook.actions]

            for (let action of actions) {
                const actionKeys = Object.keys(action)

                // Iterate each of the specified actions.
                for (let key of actionKeys) {
                    const fields = []

                    try {
                        if (!this.actions[key]) {
                            throw new Error(`Unsupported action: ${key}`)
                        }

                        // Parse options and execute action.
                        const actionOptions = this.parseActionOptions(action[key], data)
                        await this.actions[key](actionOptions)

                        // Log result.
                        for (let [key, value] of Object.entries(actionOptions)) {
                            fields.push(`${key}=${value}`)
                        }

                        logger.info("Eventhooks.processEvent", key, fields.join(", "))
                    } catch (ex) {
                        logger.error("Eventhooks.processEvent", key, `Data keys: ${Object.keys(eventhook.data).join(", ")}`, ex)
                    }
                }
            }
        }
    }

    /**
     * Parse the action options, by replacing properties
     * with data from the event when necessary.
     */
    parseActionOptions = (actionOptions, data) => {
        const result = _.cloneDeep(actionOptions)
        let key: string, value: any

        for ([key, value] of Object.entries(result)) {
            try {
                if (_.isString(value)) {
                    continue
                }

                // Value represents a field from the data passed with the event.
                if (value.data) {
                    result[key] = data[value.data]
                    continue
                }

                // Value is a a javascript evaluation. Use with care!
                if (value.eval) {
                    result[key] = eval(value.eval)
                    continue
                }
            } catch (ex) {
                logger.error("Eventhooks.parseActionOptions", ex)
            }
        }

        return result
    }

    // List of available actions for payment hooks.
    actions = {
        // Make a payment.
        payment: async (options: PaymentOptions, _data: any) => {
            await bunq.makePayment(options)
        },
        // Send data to an URL. By default it will POST (if no method was specified).
        url: async (options: any) => {
            if (!options.method) {
                options.method = "POST"
            }

            options.json = true
            await request(options)
        },
        // Send an email. By default will send to the email specified on the settings.
        email: async (options: EmailNotificationOptions) => {
            await notifications.toEmail(options)
        }
    }
}

// Exports...
export = Eventhooks.Instance

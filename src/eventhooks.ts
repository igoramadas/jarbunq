// Eventhooks

import _ = require("lodash")
import bunq = require("./bunq")
import jaul = require("jaul")
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
    init = async (): Promise<void> => {
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
                const eventName = me.substring(sep + 1)
                let moduleId = me.substring(0, sep)
                let eventhook: EventhookOptions

                // Module ID might be specified as class names or filenames.
                // In case of class names we must convert from PascalCase to dash-case.
                const pascalReplacer = function(_x, y) {
                    return "-" + y.toLowerCase()
                }
                moduleId = moduleId.replace(/\.?([A-Z]+)/g, pascalReplacer).replace(/^-/, "")

                // Load the specified module.
                let obj = require(`./${moduleId}`)

                // Iterate the specified eventooks.
                for (eventhook of settings.eventhooks[me]) {
                    const validateMsg = this.validateSpecs(moduleId, eventName, eventhook)

                    // Eventhook specs not valid? Alert and stop here.
                    if (validateMsg != null) {
                        logger.error("Eventhooks.load", me, "Invalid specs", validateMsg)
                        continue
                    }

                    // Helper to create the callback to process the event.
                    const createCallback = (m, e, hook) => {
                        return async (...args) => {
                            logger.debug("Eventhooks.callback", m, e)
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

    /**
     * Check if the passed eventhook specs is valid. Returns a string if failed,
     * or null if no issues were found.
     * @param moduleId Name of the module (without .ts or .js)
     * @param eventName The name of the event being triggered
     * @param specs The eventhook sepcs
     */
    validateSpecs = (moduleId: string, eventName: string, specs: EventhookOptions): string => {
        if (specs.data == null && specs.actions == null) {
            return "Eventhook with empty data and actions"
        }

        try {
            if (specs.actions == null || specs.actions.lenth == 0) {
                return "Eventhook with empty actions, please define at least 1 action"
            }

            const actions = _.isArray(specs.actions) ? specs.actions : [specs.actions]
            const hasPayment = _.some(actions, a => {
                return a.payment != null
            })

            // Bunq callbacks with payment actions must have data filters.
            if (moduleId == "bunq" && eventName == "callback") {
                if (specs.data == null && hasPayment) {
                    return "Bunq.callback eventhooks with payment as action must implement data filters"
                }
            }

            return null
        } catch (ex) {
            logger.error("Eventhooks.validateSpecs", moduleId, eventName, ex)
            return `Exception: ${ex.toString()}`
        }
    }

    // EVENTHOOKS
    // --------------------------------------------------------------------------

    /**
     * Process an event. Check if it matches the specified conditions,
     * and if so, execute the defined actions.
     * @param eventhook The eventhook definition.
     * @param args Arguments containing data passed with the event.
     */
    processEvent = async (eventhook: EventhookOptions, args: any) => {
        for (let data of args) {
            logger.debug("Eventhooks.processEvent", eventhook, data)

            // Check if data matches the filters. If not, continue to next data object.
            if (!this.matchEventData(eventhook, data)) {
                continue
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
                        if (eventhook.data == null) {
                            logger.error("Eventhooks.processEvent", key, `No data filters`, ex)
                        } else {
                            logger.error("Eventhooks.processEvent", key, `Data keys: ${Object.keys(eventhook.data).join(", ")}`, ex)
                        }
                    }
                }
            }
        }
    }

    /**
     * Check if the event data passes the specified eventhook filters.
     * @param eventhook The eventhook definition.
     * @param data A data passed by the event.
     */
    matchEventData = (eventhook, data) => {
        if (data === null) {
            return true
        }

        if (eventhook.data == null) {
            logger.debug("Eventhooks.processEvent", "Passed eventhook has no data filters")
            return true
        }

        // Iterate data properties and check against the filters.
        // It will return false straight away when it's not a match,
        // and continue to next property when a match is found.
        for (let [key, value] of Object.entries(eventhook.data)) {
            try {
                let condition: string, cValue: any

                // Data not found? Stop right here.
                if (typeof data[key] == "undefined" || (data[key] === null && value)) {
                    return false
                }

                // Data has an exact match? Continue.
                if (data[key] === value) {
                    continue
                }

                // If an array with 2 indexes, we expect it's a [condition, value] type,
                // otherwise assume the generic "has".
                if (_.isArray(value) && (value as any[]).length == 2) {
                    condition = value[0]
                    cValue = value[1]
                } else {
                    condition = "has"
                    cValue = value
                }

                // Less than...
                if ((condition == "<" || condition == "lt") && cValue < data[key]) continue

                // Less than equals...
                if ((condition == "<=" || condition == "lte") && cValue <= data[key]) continue

                // More than...
                if ((condition == ">" || condition == "gt") && cValue > data[key]) continue

                // More than equals...
                if ((condition == ">=" || condition == "gte") && cValue >= data[key]) continue

                // Equal...
                if ((condition == "=" || condition == "==" || condition == "eq") && cValue === data[key]) continue

                // Not equal...
                if ((condition == "!=" || condition == "neq") && cValue !== data[key]) continue

                // Default comparison: has...
                if (condition == "has") {
                    const dataString = data[key].toString().toLowerCase()
                    const valueString = cValue.toString().toLowerCase()

                    if (dataString.indexOf(valueString) >= 0) {
                        continue
                    }
                }

                // If we reach here than either definitions was wrong, or nothing was found, so return false.
                return false
            } catch (ex) {
                logger.error("Eventhooks.processEvent", key, value, ex)
                data = null
            }
        }

        // Everything passed.
        return true
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
                if (value == null) {
                    continue
                }

                // Check if value is pointing to a property from the data (starts with @@).
                if (_.isString(value)) {
                    if (value == "@@") {
                        result[key] = JSON.stringify(value, null, 1)
                    } else if (value.substring(0, 2) == "@@") {
                        result[key] = data[value.substring(2)]
                    } else {
                        result[key] = jaul.data.replaceTags(value, data)
                    }
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
        payment: async (options: PaymentOptions, _data: any): Promise<void> => {
            await bunq.makePayment(options)
        },
        // Send data to an URL. By default it will POST (if no method was specified).
        url: async (options: any): Promise<void> => {
            if (options.method == null) {
                options.method = "POST"
            }
            if (options.json !== false) {
                options.json = true
            }

            await request(options)
        },
        // Send an email. By default will send to the email specified on the settings.
        email: async (options: EmailNotificationOptions): Promise<void> => {
            await notifications.toEmail(options)
        },
        // Send a push notification.
        push: async (options: PushNotificationOptions): Promise<void> => {
            await notifications.toPush(options)
        }
    }
}

// Exports...
export = Eventhooks.Instance

// Hue

import BaseEvents = require("./base-events")

const logger = require("anyhow")
const request = require("request-promise-native")
const settings = require("setmeup").settings
const url = require("url")

/**
 * Triggers action on a Philips Hue bridge.
 */
class Hue extends BaseEvents {
    private static _instance: Hue
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    // PROPERTIES
    // --------------------------------------------------------------------------

    /** Details about the connected Hue bridge. */
    bridge: any

    // INIT AND LOGIN
    // --------------------------------------------------------------------------

    /**
     * Init the Hue module.
     */
    async init() {
        logger.error("HUE NOT IMPLEMENTED YET")
    }

    bridgeLogin = async () => {
        logger.error("HUE NOT IMPLEMENTED YET")
    }

    // API METHODS
    // --------------------------------------------------------------------------

    apiRequest = async (urlPath: string, options: any) => {
        const reqUrl = `http://${settings.hue.ip}:${settings.hue.port}/api/${settings.hue.api.user}/` + urlPath

        // Set request URL object.
        const reqOptions: any = {uri: url.parse(reqUrl, {encoding: settings.general.encoding})}

        // Set request parameters.
        if (options != null) {
            reqOptions.method = options.method || (options.body != null ? "POST" : "GET")
            reqOptions.body = options.body
        } else {
            reqOptions.method = "GET"
        }

        // Make the HTTP request.
        let result = await request(reqOptions)
        return result
    }
}

// Exports...
export = Hue.Instance

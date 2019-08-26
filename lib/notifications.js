"use strict";
// Notifications
const logger = require("anyhow");
const settings = require("setmeup").settings;
/**
 * Manages notifications via email.
 */
class Notifications {
    static get Instance() {
        return this._instance || (this._instance = new this());
    }
    // MAIN METHODS
    // --------------------------------------------------------------------------
    /**
     * Send notification via email.
     */
    sendEmail() {
        logger.info("NOT IMPLEMENTED", settings.email);
    }
}
module.exports = Notifications.Instance;

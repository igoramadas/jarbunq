// Notifications

const logger = require("anyhow")
const settings = require("setmeup").settings

/**
 * Manages notifications via email.
 */
class Notifications {
    private static _instance: Notifications
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    // MAIN METHODS
    // --------------------------------------------------------------------------

    /**
     * Send notification via email.
     */
    sendEmail(): void {
        logger.info("NOT IMPLEMENTED", settings.email)
    }
}

// Exports...
export = Notifications.Instance

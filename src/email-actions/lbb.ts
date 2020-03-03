// LBB Amazon Card Email Action
// DEPRECATED! LBB does not send the invoice amount via email any longer, unfortunately.

import logger = require("anyhow")

// Exported function.
const EmailAction = async (): Promise<any> => {
    logger.warn("EmailAction.Lbb", "The LBB email action is deprecated, please remove it from your settings!")
    return null
}

// Default rule for lbb action.
EmailAction.defaultRule = {
    from: "noreply@lbb.de",
    subject: "Kreditkarten-Abrechnung online"
}

// Exports...
export = EmailAction

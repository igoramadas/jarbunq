import BaseEvents = require("./base-events");
import EmailAccount = require("./email-account");
/**
 * Manages email accounts, defined as [[EmailAccount]].
 */
declare class EmailManager extends BaseEvents {
    private static _instance;
    static readonly Instance: EmailManager;
    /** Email accounts. */
    accounts: EmailAccount[];
    /** SMTP client created via Nodemailer. */
    smtp: any;
    /**
     * Init the email accounts.
     */
    init(): Promise<void>;
    /**
     * Start parsing relevant messages on the mail server.
     * @event start
     */
    start: () => void;
    /**
     * Stops parsing messages on the mail server.
     * @event stop
     */
    stop: () => void;
}
declare const _default: EmailManager;
export = _default;

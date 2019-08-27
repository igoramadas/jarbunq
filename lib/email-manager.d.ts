import EventEmitter = require("eventemitter3");
import EmailAccount = require("./email-account");
/**
 * Manages email accounts, defined as [[EmailAccount]].
 */
declare class EmailManager {
    private static _instance;
    static readonly Instance: EmailManager;
    /** Event emitter. */
    events: EventEmitter;
    /** Email accounts. */
    accounts: EmailAccount[];
    /** SMTP client created via Nodemailer. */
    smtp: any;
    /**
     * Bind callback to event. Shortcut to `events.on()`.
     * @param eventName The name of the event.
     * @param callback Callback function.
     */
    on(eventName: string, callback: EventEmitter.ListenerFn): void;
    /**
     * Bind callback to event that will be triggered only once. Shortcut to `events.once()`.
     * @param eventName The name of the event.
     * @param callback Callback function.
     */
    once(eventName: string, callback: EventEmitter.ListenerFn): void;
    /**
     * Unbind callback from event. Shortcut to `events.off()`.
     * @param eventName The name of the event.
     * @param callback Callback function.
     */
    off(eventName: string, callback: EventEmitter.ListenerFn): void;
    /**
     * Init the email accounts.
     */
    init(): Promise<void>;
    /**
     * Start parsing relevant messages on the mail server.
     * @event start
     */
    start: () => any;
    /**
     * Stops parsing messages on the mail server.
     * @event stop
     */
    stop: () => void;
}
declare const _default: EmailManager;
export = _default;

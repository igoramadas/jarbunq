import EventEmitter = require("eventemitter3");
/**
 * Represents a single IMAP mail account.
 */
declare class EmailAccount {
    /** Default EmailAccount constructor. */
    constructor(id: string, config: any);
    /** Event emitter. */
    events: EventEmitter;
    /** ID of this email account. */
    id: string;
    /** IMAP account configuration. */
    config: any;
    /** IMAP connection client. */
    client: any;
    /** Cache of email message IDs. */
    messageIds: any;
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
     * Start parsing relevant messages on the mail server.
     * @event start
     */
    start(): void;
    /**
     * Stops parsing messages on the mail server.
     * @event stop
     */
    stop(): void;
    /**
     * Opens the mailbox.
     * @param retry When true it will retry opening the mailbox if failed.
     */
    openBox(retry: boolean): void;
    /**
     * Fetch new unread messages for the specified account.
     * @param since Optional date, if not specified will fetch new / unseen messages.
     */
    fetchMessages(since?: Date): void;
    /**
     * Download the specified message and load the related Email Action.
     * @param msg
     */
    downloadMessage(rawMessage: any): void;
    processMessage(message: any): Promise<void>;
}
export = EmailAccount;

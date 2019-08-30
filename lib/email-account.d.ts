import BaseEvents = require("./base-events");
/**
 * Represents a single IMAP mail account.
 */
declare class EmailAccount extends BaseEvents {
    /** Default EmailAccount constructor. */
    constructor(id: string, config: any);
    /** ID of this email account. */
    id: string;
    /** IMAP account configuration. */
    config: any;
    /** IMAP connection client. */
    client: any;
    /** Cache of email message IDs. */
    messageIds: any;
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
     * @param rawMessage The unprocessed, raw message
     */
    downloadMessage(rawMessage: any): void;
    /**
     * Process the specified message against the rules defined on the settings.
     * @param message The downloaded email message
     */
    processMessage(message: any): Promise<void>;
}
export = EmailAccount;

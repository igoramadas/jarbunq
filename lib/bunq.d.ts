import EventEmitter = require("eventemitter3");
/**
 * This is a wrapper over bunq-js-client, and should have all the business
 * logic to handle notifications and transactions at bunq.
 */
declare class Bunq {
    private static _instance;
    static readonly Instance: Bunq;
    /** The authentication URL used to start the OAuth2 flow. */
    readonly authenticated: boolean;
    /** The authentication URL used to start the OAuth2 flow. */
    readonly authUrl: string;
    /** Event emitter. */
    events: EventEmitter;
    /** The main user data. */
    user: any;
    /** List of bank accounts. */
    accounts: any[];
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
     * Create the bunq-js-client and load initial data.
     */
    init(): Promise<never>;
    /**
     * Get the OAuth2 access token based on the provided authorization code.
     * This method will return null when it fails to get the token.
     * @param code The authorization code provided via the /auth URL.
     */
    getOAuthToken: (code: string) => Promise<boolean>;
    /**
     * Load user info and its main accounts.
     */
    refreshUserData: () => Promise<void>;
    /**
     * Get the main user account.
     */
    getUser: () => Promise<void>;
    /**
     * Get all the relevant accounts for the user.
     */
    getAccounts: () => Promise<void>;
    /**
     * Get the current account balance for the specified alias.
     * @param alias The email, phone or IBAN of the account.
     */
    getAccountBalance: (alias: string) => Promise<any>;
    /**
     * Make a payment to another account.
     * @param options The payment options.
     */
    makePayment: (options: PaymentOptions) => Promise<any>;
}
/**
 * Defines payment options.
 */
interface PaymentOptions {
    /** The source account. */
    fromAccount?: number | string;
    /** Target account alias can be an email, phone or IBAN. */
    toAlias: string;
    /** Payment description, only valid ASCII characters. */
    description: string;
    /** Payment amount. */
    amount: number | string;
    /** Payment currency, default is EUR. */
    currency?: string;
    /** Set to true to make a draft payment (request) instead of regular (automatic). */
    draft?: boolean;
    /** A unique reference to the payment, to avoid duplicates. */
    reference?: string;
    /** The hash generated based on reference or payment data. */
    hash?: string;
}
declare const _default: Bunq;
export = _default;

/**
 * Manages notifications via email.
 */
declare class Notifications {
    private static _instance;
    static readonly Instance: Notifications;
    /**
     * Send notification via email.
     */
    sendEmail(): void;
}
declare const _default: Notifications;
export = _default;

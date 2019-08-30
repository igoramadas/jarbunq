import BaseEvents = require("./base-events");
/**
 * Used to send notifications to users. Right now only email is supported.
 */
declare class Notifications extends BaseEvents {
    private static _instance;
    static readonly Instance: Notifications;
    /** SMTP client created via Nodemailer. */
    smtp: any;
    /**
     * Init the notifications module.
     */
    init(): Promise<void>;
    /**
     * Sends a notification to the user.
     * @param options Notification options with subject and message.
     * @event send
     */
    send: (options: NotificationOptions) => Promise<void>;
    /**
     * Sends an email via SMTP.
     * @param options Email sending options with to, subject, body etc.
     * @event toEmail
     */
    toEmail: (options: EmailOptions) => Promise<void>;
}
/**
 * Defines a generic notification.
 */
interface NotificationOptions {
    /** The notification subject. */
    subject: string;
    /** The actual message to be sent. */
    message: string;
}
/**
 * Defines an email notification.
 */
interface EmailOptions {
    /** The email subject. */
    subject: string;
    /** The email message. */
    message: string;
    /** The sender email address. If unspecified, will use defaul from settings. */
    from?: string;
    /** The target email address. */
    to?: string;
    /** The actual HTML to be sent out (filled automatically during send, by using template + message). */
    html?: string;
}
declare const _default: Notifications;
export = _default;

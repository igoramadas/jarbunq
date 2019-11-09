/**
 * Defines an activity from Strava.
 */
interface Activity {
    /** Name of the strava activity. */
    name: string
    /** Date and time when it started. */
    date: Date
    /** Total distance in kilometers. */
    distance: number
    /** Total elevation in kilometers. */
    elevation: number
    /** Moving time in the format hh:mm:ss. */
    movingTime: string
    /** Total elapsed time in the format hh:mm:ss. */
    elapsedTime: string
    /** Activity starting location (country). */
    location: string
}

/**
 * Defines a notification (callback) sent from bunq.
 */
interface BunqNotification {
    /** Notification event ID. */
    id: number
    /** Notification category (lowercased). */
    category: string
    /** Notification description. */
    description: string
    /** Date and time of the event. */
    date: Date
    /** Billed amount. */
    amount: number
    /** Billed currency. */
    currency: string
    /** Original / local amount. */
    originalAmount?: number
    /** Original / local currency. */
    originalCurrency?: string
    /** Event type. */
    eventType?: string
    /** Account ID. */
    accountId?: number
    /** Auto save amount. */
    autoSavePaymentId?: number
    /** City where event happened. */
    city?: string
}

/**
 * Defines a rule to trigger an email action.
 */
interface EmailActionRule {
    /** ID of the action to be executed. */
    action: string
    /** The from field must contain any of these values.  */
    from?: string | string[]
    /** The email subject must contain any of these values.  */
    subject?: string | string[]
    /** The email body must contain any of these values.  */
    body?: string | string[]
    /** Source account alias can be an email, phone or IBAN. */
    fromAlias?: string
    /** Target account alias can be an email, phone or IBAN. */
    toAlias?: string
    /** Payment amount, if any. */
    amount: number
}

/**
 * Defines an email notification.
 */
interface EmailNotificationOptions extends NotificationOptions {
    /** The sender email address. If unspecified, will use defaul from settings. */
    from?: string
    /** The target email address. */
    to?: string
    /** The actual HTML to be sent out (usually filled automatically during send). */
    html?: string
}

/**
 * Specifications for an eventhook definition.
 */
interface EventhookOptions {
    /** The data received by the event. */
    data: any
    /** The action(s) to be taken. */
    actions: any
}

/**
 * Defines a notification filter URL (channel) opened with bunq.
 */
interface NotificationFilterUrl {
    /** The URL id. */
    id: number
    /** The category, can be PAYMENT, DRAFT_PAYMENT, CARD_TRANSACTION_SUCCESSFUL, CARD_TRANSACTION_FAILED. */
    category: string
    /** Date of creation. */
    date: Date
}

/**
 * Defines a generic notification from Jarbunq to the user.
 */
interface NotificationOptions {
    /** The notification subject. */
    subject: string
    /** The actual message to be sent. */
    message: string
}

/**
 * Defines payment options.
 */
interface PaymentOptions {
    /** The source account alias can be an email or phone. */
    fromAlias?: number | string
    /** Target account alias can be an email, phone or IBAN. */
    toAlias: number | string
    /** Mandatory counterparty name when paying to a IBAN. */
    toName?: string
    /** Payment description, only valid ASCII characters. */
    description: string
    /** Payment amount. */
    amount: number
    /** Payment currency, default is EUR. */
    currency?: string
    /** Set to true to make a draft payment (request) instead of regular (automatic). */
    draft?: boolean
    /** A unique reference to the payment, to avoid duplicates. */
    reference?: string
    /** Extra notes to be added to the payment. */
    notes?: string | string[]
    /** The hash generated based on reference or payment data. */
    hash?: string
}

/**
 * Defines a payment on bunq.
 */
interface Payment extends PaymentOptions {
    /** ID of the payment. */
    id: number
    /** Date and time of payment. */
    date: Date
    /** Error string if any, if successful this should be null. */
    error?: string
    /** If payment was reversed, the reverse payment ID is set here. */
    reverseId?: number
}

/**
 * Defines an email message that was processed by actions.
 */
interface ProcessedEmail {
    /** Date of the email. */
    date: Date
    /** Email message ID. */
    messageId: string
    /** The from address. */
    from: string
    /** Email subject. */
    subject: string
    /** Array of email actions. */
    actions: any
}

/**
 * Defines a payment made for activity mileage.
 */
interface StravaPayment {
    payment: {
        /** ID of the payment. */
        id: number
        /** Total amount of payment. */
        amount: number
    }
    /** Date and time of payment. */
    date: Date
    /** Total distance in kilometers. */
    totalKm: number
    /** How many activities. */
    activityCount: number
}

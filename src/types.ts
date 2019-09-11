/**
 * Defines an activity from Strava.
 */
export interface Activity {
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
 * Defines a rule to trigger an email action.
 */
export interface EmailActionRule {
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
export interface EmailNotificationOptions extends NotificationOptions {
    /** The sender email address. If unspecified, will use defaul from settings. */
    from?: string
    /** The target email address. */
    to?: string
    /** The actual HTML to be sent out (usually filled automatically during send). */
    html?: string
}

/**
 * Defines payment options.
 */
export interface PaymentOptions {
    /** The source account alias can be an email or phone. */
    fromAlias?: number | string
    /** Target account alias can be an email, phone or IBAN. */
    toAlias: string
    /** Payment description, only valid ASCII characters. */
    description: string
    /** Payment amount. */
    amount: number | string
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
 * Defines a generic notification.
 */
export interface NotificationOptions {
    /** The notification subject. */
    subject: string
    /** The actual message to be sent. */
    message: string
}

/**
 * Defines a payment on bunq.
 */
export interface Payment extends PaymentOptions {
    /** ID of the payment. */
    id: number
    /** Date and time of payment. */
    date: Date
    /** Error string if any, if successful this should be null. */
    error?: string
}

/**
 * Defines an email message that was processed by actions.
 */
export interface ProcessedEmail {
    date: Date
    messageId: number
    from: string
    subject: string
    actions: any[]
}

/**
 * Defines a payment made for activity mileage.
 */
export interface StravaPayment {
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

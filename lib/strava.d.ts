/**
 * Gets rides and activities from Strava.
 */
declare class Strava {
    private static _instance;
    static readonly Instance: Strava;
    /** Timer to trigger the payments (via setTimeout). */
    timerPay: any;
    /**
     * Init the Strava module by setting up the payment timer.
     */
    init(): Promise<any>;
    /**
     * Internal implementation to make a request to the Strava API.
     * @param path The API path.
     * @param params Additional parameters to be passed.
     */
    makeRequest: (path: string, params?: any) => Promise<any>;
    /**
     * Get list of activities from Strava.
     * @param query Query options, currently only supports "since".
     */
    getActivities: (query: any) => Promise<Activity[]>;
    /**
     * Get recent activities from Strava.
     * @param since Since that many days, for example 7 gets all activities for last 7 days excluding today.
     */
    getRecentActivities: (since: number) => Promise<Activity[]>;
    /**
     * Make a payment regarding the mileage of recent activities.
     */
    payForActivities: () => Promise<void>;
}
/**
 * Defines an activity.
 */
interface Activity {
    /** Name of the strava activity. */
    name: string;
    /** Date and time when it started. */
    date: Date;
    /** Total distance in kilometers. */
    distance: number;
    /** Total elevation in kilometers. */
    elevation: number;
    /** Moving time in the format hh:mm:ss. */
    movingTime: string;
    /** Total elapsed time in the format hh:mm:ss. */
    elapsedTime: string;
    /** Activity starting location (country). */
    location: string;
}
declare const _default: Strava;
export = _default;

/**
 * Routes are defined using the format "method/route". So for instance
 * "get/dashboard" would be a GET request to /dashboard. All routes
 * should be defined as async functions.
 */
declare let Routes: {
    /** Index page, redirects to home or to login. */
    "get/": (_req: any, res: any) => Promise<void>;
    /** Homepage route. */
    "get/home": (req: any, res: any) => Promise<void>;
    /** Homepage route. */
    "get/login": (req: any, res: any) => Promise<void>;
    /** Authentication route, used to start the OAuth2 auth flow. */
    "get/auth": (_req: any, res: any) => Promise<void>;
    /** OAuth2 redirect to process the code and get an access token. */
    "get/auth/callback": (req: any, res: any) => Promise<any>;
    /** Global error page, expects actual error message on the query "e". */
    "get/error": (req: any, res: any) => Promise<void>;
};
export = Routes;

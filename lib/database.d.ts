import BaseEvents = require("./base-events");
/**
 * Manages data stored by the service on the jarbunq.db file.
 */
declare class Database extends BaseEvents {
    private static _instance;
    static readonly Instance: Database;
    /** Holds the lowdb instance. */
    db: any;
    /** Shortcut to db.get(). */
    get: Function;
    /** Shortcut to db.set(). */
    set: Function;
    /** Shortcut to db.unset(). */
    unset: Function;
    /**
     * Init and load data from jarbunq.db.
     */
    init(): Promise<void>;
    /**
     * Shortcut to add a new object to the specified table.
     * @param table The table name.
     * @param value The object to be added.
     */
    insert: (table: string, value: any) => void;
}
declare const _default: Database;
export = _default;

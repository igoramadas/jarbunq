/**
 * Manages data stored by the service.
 */
declare class Database {
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
     * Load from database.json store.
     */
    init(): Promise<void>;
    /**
     * Shortcut to add a new object to the specified table.
     * @param table The table name.
     * @param value The object to be added.
     */
    insert(table: string, value: any): void;
}
declare const _default: Database;
export = _default;

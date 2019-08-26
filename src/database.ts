// Database

const lowdb = require("lowdb")

/**
 * Manages data stored by the service.
 */
class Database {
    private static _instance: Database
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    // PROPERTIES
    // --------------------------------------------------------------------------

    /** Holds the lowdb instance. */
    db: any

    /** Shortcut to db.get(). */
    get: Function

    /** Shortcut to db.set(). */
    set: Function

    /** Shortcut to db.unset(). */
    unset: Function

    // METHODS
    // --------------------------------------------------------------------------

    /**
     * Load from database.json store.
     */
    async init() {
        const FileAsync = require("lowdb/adapters/FileAsync")
        this.db = await lowdb(new FileAsync("database.json"))

        // Write defaults.
        this.db.defaults({client: {}, payments: [], emails: []}).write()

        // Shortcut methods.
        this.get = this.db.get.bind(this.db)
        this.set = this.db.set.bind(this.db)
        this.unset = this.db.unset.bind(this.db)
    }

    /**
     * Shortcut to add a new object to the specified table.
     * @param table The table name.
     * @param value The object to be added.
     */
    insert(table: string, value: any) {
        this.db
            .get(table)
            .push(value)
            .write()
    }
}

// Exports...
export = Database.Instance

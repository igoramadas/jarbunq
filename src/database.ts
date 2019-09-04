// Database

import BaseEvents = require("./base-events")

const env = process.env
const fs = require("fs")
const lowdb = require("lowdb")
const crypto = require("crypto")
const logger = require("anyhow")
const path = require("path")
const settings = require("setmeup").settings

/**
 * Manages data stored by the service, data stored on the /database.json file.
 */
class Database extends BaseEvents {
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
        const dbPath = path.join(__dirname, "../", "jarbunq.db")
        const cryptoCipher = env["SETMEUP_CRYPTO_CIPHER"] || settings.database.crypto.cipher
        const cryptoKey = env["SETMEUP_CRYPTO_KEY"] || settings.database.crypto.key
        const cryptPrefix = "!enc::"
        const IV_LENGTH = 16
        const NONCE_LENGTH = 5

        // Pre-load the current database (if it exists).
        let currentData
        if (fs.existsSync(dbPath)) {
            currentData = fs.readFileSync(dbPath, {encoding: settings.general.encoding})
        }

        // Helper to encrypt the database.
        const encrypt = data => {
            const nonce = crypto.randomBytes(NONCE_LENGTH)
            const iv = Buffer.alloc(IV_LENGTH)
            nonce.copy(iv)

            const cipher = crypto.createCipheriv(cryptoCipher, cryptoKey, iv)
            const encrypted = cipher.update(data.toString())
            return cryptPrefix + Buffer.concat([nonce, encrypted, cipher.final()]).toString("base64")
        }

        // Helper to decrypt the database. Returns the data itself if failed to decrypt.
        const decrypt = data => {
            try {
                data = data.substring(cryptPrefix.length)
                const message = Buffer.from(data, "base64")
                const iv = Buffer.alloc(IV_LENGTH)
                message.copy(iv, 0, 0, NONCE_LENGTH)

                const encryptedText = message.slice(NONCE_LENGTH)
                const decipher = crypto.createDecipheriv(cryptoCipher, cryptoKey, iv)
                let decrypted = decipher.update(encryptedText)
                return Buffer.concat([decrypted, decipher.final()]).toString()
            } catch (ex) {
                logger.error("Database.decrypt", ex)
                return data
            }
        }

        // Database should be encrypted?
        if (settings.database.crypto.enabled) {
            if (currentData && currentData.substring(0, cryptPrefix.length) != cryptPrefix) {
                logger.warn("Database.init", "database.crypto.enabled = true", "File in plain text, force encrypting it now")
                fs.writeFileSync(dbPath, encrypt(currentData))
            }

            // Serialization options to encrypt and decrypt the database.
            const serialization = {
                serialize: data => {
                    try {
                        return encrypt(JSON.stringify(data, null, 0))
                    } catch (ex) {
                        logger.error("Database.serialize", "CRITICAL!", ex)
                        process.exit()
                    }
                },
                deserialize: data => {
                    try {
                        if (data === null || data === "") {
                            return {}
                        }
                        return JSON.parse(decrypt(data))
                    } catch (ex) {
                        logger.error("Database.deserialize", "CRITICAL!", ex)
                        process.exit()
                    }
                }
            }

            this.db = await lowdb(new FileAsync("jarbunq.db", serialization))
        } else {
            if (currentData && currentData.substring(0, cryptPrefix.length) == cryptPrefix) {
                logger.warn("Database.init", "database.crypto.enabled = false", "File is encrypted, force decrypting it now")
                fs.writeFileSync(dbPath, decrypt(currentData))
            }

            this.db = await lowdb(new FileAsync("jarbunq.db"))
        }

        // Write defaults.
        this.db.defaults({jsClient: {}, payments: [], emails: []}).write()

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

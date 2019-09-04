#!/usr/bin/env node

// Jarbunq CLI

const fs = require("fs")
const logger = require("anyhow")
logger.setup("console")

// Action help: outputs the help to the console.
const help = () => {
    console.log("")
    console.log("Jarbunq CLI")
    console.log("------------------------------------------------------------------")
    console.log("Usage: bacli.js [action]")
    console.log("------------------------------------------------------------------")
    console.log("Actions:")
    console.log("")
    console.log("  encrypt   : encrypt database and settings.private.json files")
    console.log("  decrypt   : decrypt database and settings.private.json files")
    console.log("")
    console.log("------------------------------------------------------------------")
}

// Action encrypt: encrypts the settings.private.json file.
const encrypt = () => {
    const setmeup = require("setmeup")

    try {
        setmeup.encrypt("settings.private.json")
        logger.info("Jarbunq CLI", "Encrypted values on settings.private.json")
    } catch (ex) {
        logger.error("Jarbunq CLI", "encrypt", ex)
    }
}

// Action decrypt: decrypts the settings.private.json file.
const decrypt = () => {
    const setmeup = require("setmeup")
    logger.setup()

    try {
        setmeup.decrypt("settings.private.json")
        logger.info("Jarbunq CLI", "Decrypted values on settings.private.json")
    } catch (ex) {
        logger.error("Jarbunq CLI", "decrypt", ex)
    }
}

// Action build-settings-sample: generates a sample of the current settings.private.json file.
const buildSettingsSample = () => {
    const settings = setmeup.settings
    const privateSettings = JSON.parse(fs.readFileSync(__dirname + "/settings.private.json", {encoding: settings.general.encoding}))
    const privateSettingsSample = JSON.parse(fs.readFileSync(__dirname + "/settings.private.json.sample", {encoding: settings.general.encoding}))

    // Recursive function to replace private values with type strings.
    const settingsReplacer = function(source, target) {
        const keys = Object.keys(source)

        for (let key of keys) {
            const objType = typeof source[key]

            if (target == null) {
                target = {}
            }

            if (objType == "object") {
                settingsReplacer(source[key], target[key])
            } else if (target[key] != null && target[key].toString().includes(":")) {
                source[key] = target[key]
            } else {
                source[key] = objType
            }
        }
    }
    settingsReplacer(privateSettings, privateSettingsSample)

    // Write sample settings.
    fs.writeFileSync(__dirname + "/settings.private.json.sample", JSON.stringify(privateSettings, null, 4))

    logger.info("Jarbunq CLI", "Generated / updated the settings.private.json.sample file")
}

// Parse CLI arguments...
for (let arg of process.argv) {
    if (arg == "help") {
        return help()
    } else if (arg == "encrypt") {
        return encrypt()
    } else if (arg == "decrypt") {
        return decrypt()
    } else if (arg == "build-settings-sample") {
        return buildSettingsSample()
    }
}

// Build script
// For now it will only generate a sample of the settings.private.json file.

const fs = require("fs")

// Load settings.
const setmeup = require("setmeup")
setmeup.load()
const settings = setmeup.settings

// Load the settings.private.json file.
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

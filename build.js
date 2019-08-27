// Build script
// For now it will only generate a sample of the settings.private.json file.

const fs = require("fs")

// Load settings.
const setmeup = require("setmeup")
setmeup.load()
const settings = setmeup.settings

// Load the settings.private.json file.
const privateSettings = JSON.parse(fs.readFileSync(__dirname + "/settings.private.json", {encoding: settings.general.encoding}))

// Recursive function to replace private values with type strings.
const settingsReplacer = function(obj) {
    const keys = Object.keys(obj)

    for (let key of keys) {
        const objType = typeof obj[key]
        if (objType == "object") {
            settingsReplacer(obj[key])
        } else {
            obj[key] = objType
        }
    }
}
settingsReplacer(privateSettings)

// Write sample settings.
let sampleSettings = "// PRIVATE SETTINGS SAMPLE FILE\n// For more info, please check https://github.com/igoramadas/bunq-assistant/wiki/Private-settings\n\n"
sampleSettings += JSON.stringify(privateSettings, null, 4)
fs.writeFileSync(__dirname + "/settings.private.json.sample", sampleSettings)

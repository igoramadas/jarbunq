"use strict";
// Base class with events
const EventEmitter = require("eventemitter3");
/**
 * Base class with events.
 */
class BaseEvents {
    constructor() {
        /** Event emitter. */
        this.events = new EventEmitter();
    }
    /**
     * Bind callback to event. Shortcut to `events.on()`.
     * @param eventName The name of the event.
     * @param callback Callback function.
     */
    on(eventName, callback) {
        this.events.on(eventName, callback);
    }
    /**
     * Bind callback to event that will be triggered only once. Shortcut to `events.once()`.
     * @param eventName The name of the event.
     * @param callback Callback function.
     */
    once(eventName, callback) {
        this.events.on(eventName, callback);
    }
    /**
     * Unbind callback from event. Shortcut to `events.off()`.
     * @param eventName The name of the event.
     * @param callback Callback function.
     */
    off(eventName, callback) {
        this.events.off(eventName, callback);
    }
}
module.exports = BaseEvents;

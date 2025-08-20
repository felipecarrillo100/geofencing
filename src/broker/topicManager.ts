type ListenerFn = (destination: string, body: string) => void;

const listeners = new Map<string, Set<ListenerFn>>();

/** Add listener for a destination */
export function addTopicListener(destination: string, listener: ListenerFn) {
    let set = listeners.get(destination);
    if (!set) {
        set = new Set();
        listeners.set(destination, set);
    }

    const before = set.size;
    set.add(listener);

    // Debug print (only if something changed)
    if (set.size > before) {
        console.debug(
            ` - [TopicManager] Added listener for ${destination} total=${set.size}`
        );
    } else {
        console.debug(
            ` - [TopicManager] Listener already registered for ${destination} total=${set.size}`
        );
    }
}

/** Remove listener for a destination */
export function removeTopicListener(destination: string, listener: ListenerFn) {
    const set = listeners.get(destination);
    if (!set) return;

    const removed = set.delete(listener);

    if (removed) {
        console.debug(
            ` - [TopicManager] Removed listener for ${destination} total=${set.size}`
        );
    }

    if (set.size === 0) {
        listeners.delete(destination);
        console.debug(` - [TopicManager] No listeners left for ${destination}, removed`);
    }
}

/** Publish message to all listeners of a topic */
export function publishToTopic(destination: string, body: string) {
    const set = listeners.get(destination);
    if (!set || set.size === 0) {
        console.debug(`[TopicManager] No listeners for ${destination}, skipping`);
        return;
    }

    for (const listener of Array.from(set)) {
        try {
            listener(destination, body);
        } catch (e) {
            console.error("[TopicManager] Listener error", destination, e);
        }
    }
}

/** Count listeners for debug purposes */
export function countListeners(destination?: string) {
    if (destination) {
        return listeners.get(destination)?.size ?? 0;
    }
    let total = 0;
    for (const set of listeners.values()) total += set.size;
    return total;
}

/** Utility: clear all listeners (optional) */
export function clearAllListeners() {
    listeners.clear();
    console.debug("[TopicManager] Cleared all listeners");
}

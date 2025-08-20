declare module "stomp-client" {
    export default class StompClient {
        /**
         * Create a new STOMP client over TCP.
         * @param protocol e.g. 'tcp'
         * @param host hostname of broker
         * @param port broker port
         * @param user optional username
         * @param pass optional password
         */
        constructor(host: string, port: number, user?: string, pass?: string);

        /**
         * Connect to the STOMP broker
         * @param callback called on successful connect with sessionId
         * @param errorCallback optional error handler
         * @param headers optional connect headers
         */
        connect(
            callback: (sessionId: string) => void,
            errorCallback?: (err: Error) => void,
            headers?: Record<string, string>
        ): void;

        /**
         * Subscribe to a destination
         * @param destination topic or queue
         * @param callback receives message body and headers
         */
        subscribe(
            destination: string,
            callback: (body: string, headers: Record<string, string>) => void
        ): void;

        /**
         * Publish a message to a destination
         * @param destination topic or queue
         * @param message message body
         * @param headers optional headers
         */
        publish(
            destination: string,
            message: string,
            headers?: Record<string, string>
        ): void;

        /**
         * Disconnect from broker
         * @param callback called on successful disconnect
         */
        disconnect(callback?: () => void): void;
    }
}

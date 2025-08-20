# Geofencing Event Relay

This project implements a geofencing event relay system:

- **PostgreSQL** publishes `fence_event` notifications.
- **Node.js** subscribes to Postgres notifications and relays them to **ActiveMQ** via TCP STOMP.
- **Browser clients** connect via WebSocket to the Node.js server using **STOMP** to receive live events.

---

## Features

- Real-time relay of fence events from Postgres → ActiveMQ → Browser clients.
- Supports multiple topics.
- STOMP subscriptions in the browser with auto-connect and heartbeat support.
- PostgreSQL event listening using `LISTEN/NOTIFY`.

---

## Dependencies

- [Node.js](https://nodejs.org/) v20+
- [PostgreSQL](https://www.postgresql.org/)
- [ActiveMQ](https://activemq.apache.org/)
- Node modules:
    - `express`
    - `pg`
    - `stomp-client`
    - `ws`
    - `uuid`
    - `typescript` (dev dependency)

---

## Installation

1. Clone the repository:

```bash
git clone https://github.com/felipecarrillo100/geofencing.git
cd geofencing
```

2. Install Node.js dependencies:

```bash
npm install
```

3. Ensure PostgreSQL is running and has the `geofencing_test` database:

```sql
CREATE DATABASE geofencing_test;
CREATE USER operator WITH PASSWORD 'operator';
GRANT ALL PRIVILEGES ON DATABASE geofencing_test TO operator;
```

4. Execute the `commands.sql` file in `geofencing_test`

5. Ensure ActiveMQ is running and accessible via TCP (default port `61613`).

---

## Configuration

Update database or ActiveMQ connection parameters in `src/index.ts` if needed:

```ts
const pgClient = new PgClient({
    user: 'operator',
    password: 'operator',
    host: 'localhost',
    database: 'geofencing_test',
    port: 5432,
});

const stompClient = new StompClient('localhost', 61613, 'admin', 'admin');
```

---

## Build

If using TypeScript:

```bash
npm run build
```

Compiled files will be placed in the `dist/` folder (configurable in `tsconfig.json`).

---

## Run

```bash
npm start
```

This will:

- Start the Express server on `http://localhost:3000`.
- Handle WebSocket upgrades for browser STOMP clients.
- Listen to PostgreSQL `fence_event` notifications.
- Relay events to ActiveMQ and connected browser clients.

---

## Browser Client

Include the UMD STOMP bundle in your HTML:

```html
<script src="https://cdn.jsdelivr.net/npm/@stomp/stompjs/bundles/stomp.umd.js"></script>
<script>
const ws = new WebSocket('ws://localhost:3000');
const client = StompJs.Stomp.over(() => ws);

client.connect({}, () => {
    console.log('[Browser STOMP] Connected');
    client.subscribe('/topic/fence_events', (msg) => {
        const data = JSON.parse(msg.body);
        console.log('[Browser Event]', data);
    });
});
</script>
```

---

## Project Structure

```
geofencing-project/
│
├─ src/
│   └─ index.ts        # Main Node.js server
├─ public/
│   └─ index.html      # Browser client example
├─ dist/               # Compiled TypeScript
├─ package.json
├─ tsconfig.json
└─ README.md
``` 

# Trigger geofence events
Create 2 WFS-T layers using LuciadFusion, the `fusionwfst/fences.pgs` and `fusionwfst/tracks.pgs` help you to map the tables to your WFS=T Service

Use a WFS-T Client, for instance `Catalog Explorer` to draw fences
Use a WFS-T Client, for instance `Catalog Explorer` to draw tracks

Whenever a track goes in our out of a fence an event is triggered.

Tracks inside fences are always available in DB table `fence_track_membership`


---

## Notes

- The browser connects to **Node.js WebSocket**, nodejs app acts as a relay to ActiveMQ.
- PostgreSQL triggers must send `NOTIFY fence_event, '<payload>'` for updates to propagate.
- The updates received from Postgres are forwarded to any web client subscribed
- STOMP auto-reconnect is supported in the browser via `Stomp.over(factory)`.

---

## License

MIT License


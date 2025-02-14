import { WebSocketServer, WebSocket } from 'ws';
import { config } from '../config.js';
import { findAvailablePort } from '../utils/ValidationUtils.js';
import Database from 'better-sqlite3';

interface WebSocketMessage {
    type: string;
    payload: any;
}

class NotesWebSocketServer {
    private webSocketServer: WebSocketServer | null = null;
    private connections = new Set<WebSocket>();
    private db: Database.Database;

    constructor(db: Database.Database) {
        this.db = db;
    }

    async initialize() {
        if (!config.features?.enableWebsocket) {
            console.error('WebSocket server disabled by configuration');
            return;
        }

        const port = await findAvailablePort(config.server.wsPort);
        if (!port) {
            throw new Error(`Could not find available port for WebSocket server`);
        }

        this.webSocketServer = new WebSocketServer({ port });
        console.error(`WebSocket server running on port ${port}`);

        this.setupConnectionHandlers();
    }

    private setupConnectionHandlers() {
        if (!this.webSocketServer) return;

        this.webSocketServer.on('connection', (ws: WebSocket) => {
            this.connections.add(ws);
            console.error('WebSocket connection established');

            ws.on('close', () => {
                this.connections.delete(ws);
                console.error('WebSocket connection closed');
            });

            ws.on('error', (error) => {
                console.error('WebSocket error:', error);
            });
        });
    }

    // Method to broadcast note updates to all connected clients
    public broadcastNoteUpdate(note: any) {
        const message: WebSocketMessage = {
            type: 'note_updated',
            payload: note
        };

        this.connections.forEach(ws => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(message));
            }
        });
    }

    async shutdown() {
        if (this.webSocketServer) {
            return new Promise<void>((resolve) => {
                this.webSocketServer?.close(() => {
                    this.connections.clear();
                    resolve();
                });
            });
        }
    }
}

export default NotesWebSocketServer; 
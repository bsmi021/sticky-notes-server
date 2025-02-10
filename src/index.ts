#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ErrorCode,
    ListResourcesRequestSchema,
    ListResourceTemplatesRequestSchema,
    ListToolsRequestSchema,
    McpError,
    ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import Database from 'better-sqlite3';
import express, { NextFunction } from 'express';
import { WebSocketServer } from 'ws';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { Request, Response } from 'express';

// Define Tag interface
interface Tag {
    id: number;
    name: string;
}

// Add this interface near the top with your other interfaces
interface TagRecord {
    id: number;
    name: string;
}

// Add near your other interfaces
interface Note {
    id: number;
    title: string;
    content: string;
    conversation_id: string;
    created_at: number;
    updated_at: number;
}

interface CountResult {
    count: number;
}

// Database Configuration
const DB_PATH = join(process.env.USERPROFILE || process.env.HOME || '', 'Documents', 'sticky-notes.db');

// Express App Configuration
const WEB_UI_PORT = 3000;

// Helper function to get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = join(fileURLToPath(import.meta.url), '..');

// Database instance
const db = new Database(DB_PATH, {
    fileMustExist: false,
    timeout: 5000
});

// Enable foreign keys and initialize WAL mode
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// Initialize database schema
const initDatabase = () => {
    console.error('Initializing database schema...');
    db.exec(`

        -- Notes table (removed project_id)
        CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            conversation_id TEXT NOT NULL,
            created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
            updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
        );

        -- Tags table
        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        );

        -- Junction table for note-tag relationships
        CREATE TABLE IF NOT EXISTS note_tags (
            note_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            PRIMARY KEY (note_id, tag_id),
            FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        );

        -- Full-text search virtual table
        CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
            title,
            content,
            content='notes',
            content_rowid='id'
        );

        -- FTS triggers
        CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
            INSERT INTO notes_fts(rowid, title, content)
            VALUES (new.id, new.title, new.content);
        END;

        CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
            INSERT INTO notes_fts(notes_fts, rowid, title, content)
            VALUES('delete', old.id, old.title, old.content);
        END;

        CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
            INSERT INTO notes_fts(notes_fts, rowid, title, content)
            VALUES('delete', old.id, old.title, old.content);
            INSERT INTO notes_fts(rowid, title, content)
            VALUES (new.id, new.title, new.content);
        END;

        -- Indexes for common queries
        CREATE INDEX IF NOT EXISTS idx_notes_conversation ON notes(conversation_id);
        CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag_id);
        CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
    `);
    console.error('Database schema initialized.');
};

initDatabase();

// Prepare common statements for better performance
const preparedStatements = {
    insertNote: db.prepare(`
        INSERT INTO notes (title, content, conversation_id)
        VALUES (@title, @content, @conversationId)
    `),

    searchNotes: db.prepare(`
        SELECT notes.* FROM notes_fts
        JOIN notes ON notes.id = notes_fts.rowid
        WHERE notes_fts MATCH @query
        ORDER BY rank
        LIMIT @limit OFFSET @offset
    `),
    getNotesByConversation: db.prepare(`
        SELECT * FROM notes
        WHERE conversation_id = @conversationId
        ORDER BY updated_at DESC
    `),
    getNoteById: db.prepare(`
        SELECT * FROM notes
        WHERE id = @id
    `),
    deleteNote: db.prepare(`
        DELETE FROM notes WHERE id = @id
    `),
    updateNote: db.prepare(`
        UPDATE notes 
        SET content = @content,
            updated_at = strftime('%s', 'now') 
        WHERE id = @id
    `),
    insertTag: db.prepare(`
        INSERT INTO tags (name) VALUES (@name)
    `),
    getTagByName: db.prepare(`
        SELECT * FROM tags WHERE name = @name
    `),
    insertNoteTag: db.prepare(`
        INSERT INTO note_tags (note_id, tag_id) VALUES (@note_id, @tag_id)
    `),
    deleteNoteTags: db.prepare(`
        DELETE FROM note_tags WHERE note_id = @note_id
    `),
    getTagsByNoteId: db.prepare(`
        SELECT tags.name FROM note_tags JOIN tags ON note_tags.tag_id = tags.id WHERE note_tags.note_id = @note_id
    `)
};

// MCP Server Implementation
class StickyNotesServer {
    private server: Server;
    private webSocketServer: WebSocketServer;
    private expressApp: express.Express;

    constructor() {
        this.server = new Server(
            {
                name: 'sticky-notes-server',
                version: '0.1.0',
            },
            {
                capabilities: {
                    resources: {},
                    tools: {},
                    notifications: {
                        logging: true,
                        toolProgress: true
                    }
                },
            }
        );

        this.webSocketServer = new WebSocketServer({ port: 8080 });
        this.expressApp = express();

        this.setupExpress();
        this.setupWebSocket();
        this.setupResourceHandlers();
        this.setupToolHandlers();

        // Error handling
        this.server.onerror = (error: any) => console.error('[MCP Error]', error);
        process.on('SIGINT', async () => {
            await this.server.close();
            process.exit(0);
        });
    }

    private setupExpress() {
        const publicPath = join(__dirname, 'public');
        this.expressApp.use(express.static(publicPath));
        this.expressApp.use(express.json());

        // API Routes
        this.expressApp.get('/api/notes', (req: Request, res: Response) => {
            try {
                const { search, page = 1, limit = 10, tag } = req.query;
                const offset = (Number(page) - 1) * Number(limit);

                let notes: Note[] = [];

                if (search) {
                    // Full-text search using FTS5
                    notes = preparedStatements.searchNotes.all({
                        query: search,
                        limit: Number(limit),
                        offset
                    }) as Note[];
                } else if (tag) {
                    // Search by tag
                    notes = db.prepare(`
                        SELECT DISTINCT notes.* 
                        FROM notes
                        JOIN note_tags ON notes.id = note_tags.note_id
                        JOIN tags ON tags.id = note_tags.tag_id
                        WHERE tags.name = ?
                        ORDER BY notes.updated_at DESC
                        LIMIT ? OFFSET ?
                    `).all(tag, limit, offset) as Note[];
                } else {
                    // Regular paginated query
                    notes = db.prepare(`
                        SELECT * FROM notes
                        ORDER BY updated_at DESC
                        LIMIT ? OFFSET ?
                    `).all(limit, offset) as Note[];
                }

                // Get total count for pagination
                const total = (db.prepare(`
                    SELECT COUNT(*) as count FROM notes
                `).get() as CountResult).count;

                // Add tags to notes
                const notesWithTags = notes.map(note => {
                    const tags = preparedStatements.getTagsByNoteId.all({ note_id: note.id });
                    return {
                        ...note,
                        tags: tags.map((t: any) => t.name)
                    };
                });

                res.json({
                    notes: notesWithTags,
                    pagination: {
                        total,
                        page: Number(page),
                        limit: Number(limit),
                        pages: Math.ceil(total / Number(limit))
                    }
                });
            } catch (error) {
                console.error('Error fetching notes:', error);
                res.status(500).json({ error: 'Failed to fetch notes' });
            }
        });

        this.expressApp.post('/api/notes', (req: Request, res: Response) => {
            // Handle creating a new note
            res.json({ success: true });
        });

        this.expressApp.put('/api/notes/:id', (req: Request, res: Response) => {
            // Handle updating a note
            res.json({ success: true });
        });

        this.expressApp.delete('/api/notes/:id', (req: Request, res: Response) => {
            const { id } = req.params;
            try {
                preparedStatements.deleteNote.run({ id });
                res.json({ success: true });
            } catch (error) {
                console.error('Error deleting note:', error);
                res.status(500).json({ error: 'Failed to delete note' });
            }
        });

        // Root route
        this.expressApp.get('/', (req: Request, res: Response) => {
            res.sendFile(join(publicPath, 'index.html'));
        });

        this.expressApp.listen(WEB_UI_PORT, () => {
            console.error(`Web UI running at http://localhost:${WEB_UI_PORT}`);
        });
    }

    private setupWebSocket() {
        this.webSocketServer.on('connection', ws => {
            console.error('WebSocket connection established');

            ws.on('message', message => {
                console.error('Received:', message);
                ws.send('Hello from WebSocket server!');
            });

            ws.on('close', () => {
                console.error('WebSocket connection closed');
            });
        });
    }

    private setupResourceHandlers() {
        this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
            resources: [],
        }));

        this.server.setRequestHandler(
            ListResourceTemplatesRequestSchema,
            async () => ({
                resourceTemplates: [
                    {
                        uriTemplate: 'notes://{conversationId}',
                        name: 'Notes by Conversation ID',
                        mimeType: 'application/json',
                        description: 'Returns all notes for a given conversation ID',
                    },
                    {
                        uriTemplate: 'note://{id}',
                        name: 'Note by ID',
                        mimeType: 'application/json',
                        description: 'Returns a single note by ID',
                    },

                ],
            })
        );

        this.server.setRequestHandler(
            ReadResourceRequestSchema,
            async (request: any) => {
                const uri = request.params.uri;

                if (uri.startsWith('notes://')) {
                    const conversationId = uri.substring('notes://'.length);
                    const notes = preparedStatements.getNotesByConversation.all({ conversationId });
                    return {
                        contents: [{
                            uri: uri,
                            mimeType: 'application/json',
                            text: JSON.stringify(notes, null, 2),
                        }],
                    };
                } else if (uri.startsWith('note://')) {
                    const id = uri.substring('note://'.length);
                    const note = preparedStatements.getNoteById.get({ id });
                    if (!note) {
                        throw new McpError(ErrorCode.MethodNotFound, `Note with id ${id} not found`);
                    }
                    return {
                        contents: [{
                            uri: uri,
                            mimeType: 'application/json',
                            text: JSON.stringify(note, null, 2),
                        }],
                    };
                } else {
                    throw new McpError(ErrorCode.InvalidRequest, `Invalid URI: ${uri}`);
                }
            }
        );
    }

    private setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: 'create-note',
                    description: 'Creates a new note with optional tags.\n\n' +
                        'Required Fields:\n' +
                        '- title: String (1-100 chars)\n' +
                        '- content: String (markdown supported)\n' +
                        '- conversationId: String\n\n' +
                        'Optional Fields:\n' +
                        '- tags: Array of strings\n\n' +
                        'Example: { "title": "Meeting Notes", "content": "Discussed Q4 plans", "conversationId": "conv123", "tags": ["meeting", "planning"] }',

                    inputSchema: {
                        type: 'object',
                        properties: {
                            title: { type: 'string', description: 'REQUIRED. Title of the note. Max 100 characters.' },
                            content: { type: 'string', description: 'REQUIRED. Content of the note. Supports markdown formatting.' },
                            conversationId: { type: 'string', description: 'REQUIRED. Conversation ID associated with the note.' },
                            tags: { type: 'array', items: { type: 'string' }, description: 'Optional. Array of tags to associate with the note.' },
                        },

                        required: ['title', 'content', 'conversationId'],
                    },
                },
                {
                    name: 'update-note',
                    description: 'Updates an existing note content.\n\n' +
                        'Required Fields:\n' +
                        '- id: String (note identifier)\n' +
                        '- content: String (markdown supported)\n\n' +
                        'Example: { "id": "note123", "content": "Updated content with markdown support" }',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            id: {
                                type: 'string',
                                description: 'REQUIRED. Unique identifier of the note to update.',
                            },
                            content: {
                                type: 'string',
                                description: 'REQUIRED. New content for the note. Supports markdown formatting.',
                                minLength: 1
                            }
                        },
                        required: ['id', 'content'],
                    },
                },
                {
                    name: 'delete-note',
                    description: 'Deletes a note.\n\n' +
                        'Required Fields:\n' +
                        '- id: String (note identifier)\n\n' +
                        'Example: { "id": "note123" }',
                    inputSchema: {
                        type: 'object',
                        properties: {

                            id: { type: 'string', description: 'REQUIRED. Unique identifier of the note to delete.' },
                        },
                        required: ['id'],
                    },
                },
                {
                    name: 'search-notes',
                    description: 'Searches notes',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            query: { type: 'string' },
                            tags: { type: 'array', items: { type: 'string' } },
                            conversationId: { type: 'string' },
                        },
                    },
                },
            ],
        }));

        this.server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
            const toolName = request.params.name;
            const args = request.params.arguments;

            switch (toolName) {
                case 'create-note': {
                    const { title, content, conversationId, tags } = args as any;
                    try {
                        const result = preparedStatements.insertNote.run({ title, content, conversationId });
                        const id = result.lastInsertRowid;

                        // Handle tags
                        if (tags && Array.isArray(tags)) {
                            // Delete existing tags for the note
                            preparedStatements.deleteNoteTags.run({ note_id: id });

                            for (const tagName of tags) {
                                let tagRecord = preparedStatements.getTagByName.get({ name: tagName }) as TagRecord;

                                // If tag doesn't exist, create it
                                if (!tagRecord) {
                                    const result = preparedStatements.insertTag.run({ name: tagName });
                                    tagRecord = { id: result.lastInsertRowid, name: tagName } as TagRecord;
                                }

                                // Insert note tag
                                preparedStatements.insertNoteTag.run({ note_id: id, tag_id: tagRecord.id });
                            }
                        }

                        return {
                            content: [{ type: 'text', text: `Note created with id ${id}` }],
                        };
                    } catch (error: any) {
                        console.error('Error creating note:', error);
                        return {
                            content: [{ type: 'text', text: `Error creating note: ${error.message}` }],
                            isError: true,
                        };
                    }
                }
                case 'update-note': {
                    const { id, content } = args as any;
                    try {
                        const result = preparedStatements.updateNote.run({ id, content });

                        if (result.changes === 0) {
                            return {
                                content: [{ type: 'text', text: `Note with id ${id} not found` }],
                                isError: true,
                            };
                        }

                        return {
                            content: [{ type: 'text', text: `Note updated with id ${id}` }],
                        };
                    } catch (error: any) {
                        console.error('Error updating note:', error);
                        return {
                            content: [{ type: 'text', text: `Error updating note: ${error.message}` }],
                            isError: true,
                        };
                    }
                }
                case 'delete-note': {
                    const { id } = args as any;
                    try {
                        preparedStatements.deleteNote.run({ id });
                        return {
                            content: [{ type: 'text', text: `Note deleted with id ${id}` }],
                        };
                    } catch (error: any) {
                        console.error('Error deleting note:', error);
                        return {
                            content: [{ type: 'text', text: `Error deleting note: ${error.message}` }],
                            isError: true,
                        };
                    }
                }
                case 'search-notes': {
                    const { query, tags, projectId, conversationId } = args as any;
                    let results;
                    try {
                        if (query) {
                            results = preparedStatements.searchNotes.all({ query, limit: 100, offset: 0 });
                        } else if (conversationId) {
                            results = preparedStatements.getNotesByConversation.all({ conversationId });
                        } else {
                            return {
                                content: [{ type: 'text', text: 'No search criteria provided' }],
                            };
                        }

                        return {
                            content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
                        };
                    } catch (error: any) {
                        console.error('Error searching notes:', error);
                        return {
                            content: [{ type: 'text', text: `Error searching notes: ${error.message}` }],
                            isError: true,
                        };
                    }
                }
                default:
                    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
            }
        });
    }

    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('Sticky Notes MCP server running on stdio');

        // Now we can safely send logging messages

    }
}

const server = new StickyNotesServer();
server.run().catch(console.error);

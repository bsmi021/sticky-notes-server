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
import express, { NextFunction, RequestHandler } from 'express';
import { WebSocketServer } from 'ws';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { Request, Response } from 'express';
import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';

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
    tags?: string[];
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
    timeout: 10000,
    verbose: process.env.NODE_ENV === 'development' ? console.log : undefined
});

// Enable foreign keys and initialize WAL mode
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 10000');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -2000'); // 2MB cache

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
            color_hex TEXT,
            section_id INTEGER,
            created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
            updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
            FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE SET NULL
        );

        -- Sections table
        CREATE TABLE IF NOT EXISTS sections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            order_index INTEGER NOT NULL,
            created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
            updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
        );

        -- Tags table
        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            parent_id INTEGER,
            FOREIGN KEY (parent_id) REFERENCES tags(id) ON DELETE SET NULL
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

        -- Indexes for performance
        CREATE INDEX IF NOT EXISTS idx_notes_conversation_updated ON notes(conversation_id, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_note_tags_note_id ON note_tags(note_id);
        CREATE INDEX IF NOT EXISTS idx_note_tags_tag_id ON note_tags(tag_id);
        CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
        CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_sections_order ON sections(order_index);
        CREATE INDEX IF NOT EXISTS idx_tags_parent ON tags(parent_id);
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
    `),
    createSection: db.prepare(`
        INSERT INTO sections (name, order_index)
        VALUES (@name, @order_index)
    `),
    updateSection: db.prepare(`
        UPDATE sections 
        SET name = @name,
            order_index = @order_index,
            updated_at = strftime('%s', 'now')
        WHERE id = @id
    `),
    deleteSection: db.prepare(`
        DELETE FROM sections WHERE id = @id
    `),
    getSections: db.prepare(`
        SELECT * FROM sections ORDER BY order_index ASC
    `),
    updateNoteColor: db.prepare(`
        UPDATE notes 
        SET color_hex = @color_hex,
            updated_at = strftime('%s', 'now')
        WHERE id = @id
    `),
    updateNoteSection: db.prepare(`
        UPDATE notes 
        SET section_id = @section_id,
            updated_at = strftime('%s', 'now')
        WHERE id = @id
    `),
    getNotesBySection: db.prepare(`
        SELECT * FROM notes 
        WHERE section_id = @section_id 
        ORDER BY updated_at DESC
    `),
    getTagHierarchy: db.prepare(`
        WITH RECURSIVE tag_tree AS (
            SELECT id, name, parent_id, 0 as level
            FROM tags 
            WHERE parent_id IS NULL
            UNION ALL
            SELECT t.id, t.name, t.parent_id, tt.level + 1
            FROM tags t
            JOIN tag_tree tt ON t.parent_id = tt.id
        )
        SELECT * FROM tag_tree
        ORDER BY level, name
    `),
    updateTagParent: db.prepare(`
        UPDATE tags 
        SET parent_id = @parent_id 
        WHERE id = @id
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

        // Add error handling middleware
        const errorHandler: express.ErrorRequestHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
            console.error('Error occurred:', err);

            // Handle database errors
            if (err.code === 'SQLITE_BUSY' || err.code === 'SQLITE_LOCKED') {
                res.status(503).json({
                    error: 'Database is busy, please try again',
                    code: err.code
                });
                return;
            }

            if (err.code === 'SQLITE_CONSTRAINT') {
                res.status(400).json({
                    error: 'Constraint violation',
                    code: err.code
                });
                return;
            }

            // Handle other types of errors
            res.status(err.status || 500).json({
                error: err.message || 'Internal server error',
                code: err.code
            });
        };

        // API Routes
        const getNotes = async (req: Request, res: Response, next: NextFunction) => {
            try {
                console.error('Starting getNotes request');
                const { search, page = 1, limit = 10, tags, conversation } = req.query;
                const offset = (Number(page) - 1) * Number(limit);

                // Use a transaction for consistency
                const transaction = db.transaction(() => {
                    // Base query for all cases
                    let baseQuery = 'SELECT DISTINCT notes.* FROM notes';
                    let params: any[] = [];

                    // Add joins and conditions for tag filtering
                    if (tags) {
                        const tagArray = Array.isArray(tags) ? tags : [tags];
                        if (tagArray.length > 0) {
                            baseQuery += `
                                JOIN note_tags ON notes.id = note_tags.note_id
                                JOIN tags ON note_tags.tag_id = tags.id
                                WHERE tags.name IN (${tagArray.map(() => '?').join(',')})
                                GROUP BY notes.id
                                HAVING COUNT(DISTINCT tags.name) = ?
                            `;
                            params.push(...tagArray, tagArray.length);
                        }
                    }

                    // Handle conversation filter
                    if (conversation) {
                        baseQuery += params.length === 0 ? ' WHERE' : ' AND';
                        baseQuery += ' conversation_id = ?';
                        params.push(conversation);
                    }

                    // Add ordering and pagination
                    baseQuery += ' ORDER BY notes.updated_at DESC LIMIT ? OFFSET ?';
                    params.push(Number(limit), offset);

                    console.error('Executing main query:', baseQuery, 'with params:', params);
                    const notes = db.prepare(baseQuery).all(...params) as Note[];
                    console.error('Got notes:', notes.length);

                    // If no notes, return early
                    if (notes.length === 0) {
                        console.error('No notes found, returning empty result');
                        return {
                            notes: [],
                            pagination: {
                                total: 0,
                                page: Number(page),
                                limit: Number(limit),
                                totalPages: 0
                            }
                        };
                    }

                    // Get total count with the same filtering
                    let countQuery = 'SELECT COUNT(DISTINCT notes.id) as total FROM notes';
                    let countParams: any[] = [];

                    // Add same tag filtering to count query
                    if (tags) {
                        const tagArray = Array.isArray(tags) ? tags : [tags];
                        if (tagArray.length > 0) {
                            countQuery += `
                                JOIN note_tags ON notes.id = note_tags.note_id
                                JOIN tags ON note_tags.tag_id = tags.id
                                WHERE tags.name IN (${tagArray.map(() => '?').join(',')})
                                GROUP BY notes.id
                                HAVING COUNT(DISTINCT tags.name) = ?
                            `;
                            countParams.push(...tagArray, tagArray.length);
                        }
                    }

                    if (conversation) {
                        countQuery += countParams.length === 0 ? ' WHERE' : ' AND';
                        countQuery += ' conversation_id = ?';
                        countParams.push(conversation);
                    }

                    console.error('Executing count query:', countQuery, 'with params:', countParams);
                    const totalResult = db.prepare(countQuery).get(...countParams) as { total: number };
                    console.error('Got total:', totalResult.total);

                    // Fetch all tags in a single query
                    const noteIds = notes.map(note => note.id);
                    console.error('Fetching tags for note IDs:', noteIds);

                    const tagQuery = `
                        SELECT note_tags.note_id, tags.name 
                        FROM note_tags 
                        JOIN tags ON note_tags.tag_id = tags.id 
                        WHERE note_tags.note_id IN (${noteIds.map(() => '?').join(',')})
                    `;

                    console.error('Executing tag query:', tagQuery);
                    const tagResults = db.prepare(tagQuery).all(...noteIds) as { note_id: number; name: string }[];
                    console.error('Got tag results:', tagResults.length);

                    // Group tags by note
                    const tagsByNote = new Map<number, string[]>();
                    for (const { note_id, name } of tagResults) {
                        if (!tagsByNote.has(note_id)) {
                            tagsByNote.set(note_id, []);
                        }
                        tagsByNote.get(note_id)!.push(name);
                    }

                    // Add tags to notes
                    for (const note of notes) {
                        note.tags = tagsByNote.get(note.id) || [];
                    }

                    return {
                        notes,
                        pagination: {
                            total: totalResult.total,
                            page: Number(page),
                            limit: Number(limit),
                            totalPages: Math.ceil(totalResult.total / Number(limit))
                        }
                    };
                });

                // Execute the transaction and send response
                console.error('Executing transaction');
                const result = transaction();
                console.error('Transaction complete, sending response');
                res.json(result);
                console.error('Response sent');

            } catch (error) {
                console.error('Error in getNotes:', error);
                next(error);
            }
        };

        this.expressApp.get('/api/notes', getNotes as express.RequestHandler);

        this.expressApp.post('/api/notes', async (req: Request, res: Response, next: NextFunction) => {
            try {
                const { title, content, tags = [], conversation_id = 'default', color_hex, section_id } = req.body;

                // Insert the note
                const result = db.prepare(`
                    INSERT INTO notes (title, content, conversation_id, color_hex, section_id)
                    VALUES (?, ?, ?, ?, ?)
                `).run(title, content, conversation_id, color_hex || null, section_id || null);

                const noteId = result.lastInsertRowid;

                // Handle tags
                if (tags.length > 0) {
                    const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
                    const getTagId = db.prepare('SELECT id FROM tags WHERE name = ?');
                    const linkNoteTag = db.prepare('INSERT INTO note_tags (note_id, tag_id) VALUES (?, ?)');

                    for (const tagName of tags) {
                        insertTag.run(tagName);
                        const tag = getTagId.get(tagName) as { id: number };
                        linkNoteTag.run(noteId, tag.id);
                    }
                }

                // Fetch the created note with its tags
                const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(noteId) as Note;
                const noteTags = db.prepare(`
                    SELECT tags.name 
                    FROM note_tags 
                    JOIN tags ON note_tags.tag_id = tags.id 
                    WHERE note_tags.note_id = ?
                `).all(noteId) as { name: string }[];

                note.tags = noteTags.map(t => t.name);

                res.status(201).json(note);
            } catch (error) {
                console.error('Error creating note:', error);
                next(error);
            }
        });

        this.expressApp.put('/api/notes/:id', async (req: Request, res: Response) => {
            try {
                const { id } = req.params;
                const { title, content, tags = [], conversation_id, color_hex } = req.body;

                // Update the note
                db.prepare(`
                    UPDATE notes 
                    SET title = ?, 
                        content = ?, 
                        conversation_id = ?,
                        color_hex = ?,
                        updated_at = strftime('%s', 'now')
                    WHERE id = ?
                `).run(title, content, conversation_id, color_hex, id);

                // Handle tags
                db.prepare('DELETE FROM note_tags WHERE note_id = ?').run(id);

                if (tags.length > 0) {
                    const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
                    const getTagId = db.prepare('SELECT id FROM tags WHERE name = ?');
                    const linkNoteTag = db.prepare('INSERT INTO note_tags (note_id, tag_id) VALUES (?, ?)');

                    for (const tagName of tags) {
                        insertTag.run(tagName);
                        const tag = getTagId.get(tagName) as { id: number };
                        linkNoteTag.run(id, tag.id);
                    }
                }

                // Fetch the updated note with its tags
                const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as Note;
                const noteTags = db.prepare(`
                    SELECT tags.name 
                    FROM note_tags 
                    JOIN tags ON note_tags.tag_id = tags.id 
                    WHERE note_tags.note_id = ?
                `).all(id) as { name: string }[];

                note.tags = noteTags.map(t => t.name);

                res.json(note);
            } catch (error) {
                console.error('Error updating note:', error);
                res.status(500).json({ error: 'Failed to update note' });
            }
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

        // Section Management
        this.expressApp.get('/api/sections', (req: Request, res: Response) => {
            try {
                const sections = preparedStatements.getSections.all();
                res.json({ sections });
            } catch (error) {
                res.status(500).json({ error: 'Failed to fetch sections' });
            }
        });

        this.expressApp.post('/api/sections', (req: Request, res: Response) => {
            try {
                const { name, order_index } = req.body;
                const result = preparedStatements.createSection.run({ name, order_index });
                res.json({ id: result.lastInsertRowid });
            } catch (error) {
                res.status(500).json({ error: 'Failed to create section' });
            }
        });

        this.expressApp.put('/api/sections/:id', (req: Request, res: Response) => {
            try {
                const { id } = req.params;
                const { name, order_index } = req.body;
                preparedStatements.updateSection.run({ id, name, order_index });
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ error: 'Failed to update section' });
            }
        });

        this.expressApp.delete('/api/sections/:id', (req: Request, res: Response) => {
            try {
                const { id } = req.params;
                preparedStatements.deleteSection.run({ id });
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ error: 'Failed to delete section' });
            }
        });

        // Note Color and Section Management
        this.expressApp.patch('/api/notes/:id/color', (req: Request, res: Response) => {
            try {
                const { id } = req.params;
                const { color_hex } = req.body;
                preparedStatements.updateNoteColor.run({ id, color_hex });
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ error: 'Failed to update note color' });
            }
        });

        this.expressApp.patch('/api/notes/:id/section', (req: Request, res: Response) => {
            try {
                const { id } = req.params;
                const { section_id } = req.body;
                preparedStatements.updateNoteSection.run({ id, section_id });
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ error: 'Failed to update note section' });
            }
        });

        this.expressApp.get('/api/sections/:id/notes', (req: Request, res: Response) => {
            try {
                const { id } = req.params;
                const notes = preparedStatements.getNotesBySection.all({ section_id: id });
                res.json({ notes });
            } catch (error) {
                res.status(500).json({ error: 'Failed to fetch notes for section' });
            }
        });

        // Tag Hierarchy Management
        this.expressApp.get('/api/tags/hierarchy', (req: Request, res: Response) => {
            try {
                const tags = preparedStatements.getTagHierarchy.all();
                res.json({ tags });
            } catch (error) {
                res.status(500).json({ error: 'Failed to fetch tag hierarchy' });
            }
        });

        this.expressApp.patch('/api/tags/:id/parent', (req: Request, res: Response) => {
            try {
                const { id } = req.params;
                const { parent_id } = req.body;
                preparedStatements.updateTagParent.run({ id, parent_id });
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ error: 'Failed to update tag parent' });
            }
        });

        // Register the routes
        this.expressApp.get('/api/tags', (req: Request, res: Response) => {
            try {
                const tags = db.prepare('SELECT DISTINCT name FROM tags ORDER BY name').all() as { name: string }[];
                res.json({ tags: tags.map(t => t.name) });
            } catch (error) {
                console.error('Error fetching tags:', error);
                res.status(500).json({ error: 'Failed to fetch tags' });
            }
        });

        // Root route
        this.expressApp.get('/', (req: Request, res: Response) => {
            res.sendFile(join(publicPath, 'index.html'));
        });

        // Register error handler after all routes
        this.expressApp.use(errorHandler);

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

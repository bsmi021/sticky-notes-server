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
    Request as McpRequest,
    ServerRequest,
    ServerResult,
} from '@modelcontextprotocol/sdk/types.js';
import Database from 'better-sqlite3';
import express, { NextFunction, RequestHandler } from 'express';
import { WebSocketServer } from 'ws';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { Request, Response } from 'express';
import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';
import { config } from './config.js';
import { findAvailablePort } from './utils/ValidationUtils.js';
import { ExportService } from './services/exportService.js';
import { renderMarkdown } from './utils/markdown.js';
import WebSocket from 'ws';
import NotesWebSocketServer from './websocket/server.js';

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
    color_hex?: string;
    tags?: string[];
}

interface CountResult {
    count: number;
}

interface NoteWithMetadata extends Note {
    conversationId: string;
    createdAt: number;
    updatedAt: number;
}

interface ConversationRow {
    conversation_id: string;
}

interface ResourceRequest extends McpRequest {
    type: string;
    content?: any;
    id?: string;
    params?: {
        query?: string;
        body?: any;
        id?: string;
    };
}

const DB_ROOT = process.env.DB_ROOT || process.env.USERPROFILE || process.env.HOME || '';
// Database Configuration
const DB_PATH = join(config.db.root, config.db.path);

// Express App Configuration
const WEB_UI_PORT = config.server.webUiPort;
const WS_PORT = config.server.wsPort;

// Helper function to get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = join(fileURLToPath(import.meta.url), '..');

// Database instance
const db = new Database(DB_PATH, {
    fileMustExist: false,
    timeout: config.db.timeout,
    verbose: config.db.verbose ? console.log : undefined
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

        ${config.features?.enableFTS ? `
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
        ` : ''}

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
        INSERT INTO notes (title, content, conversation_id, color_hex)
        VALUES (@title, @content, @conversationId, @color_hex)
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
    `),
    getUniqueConversations: db.prepare(`
        SELECT DISTINCT conversation_id FROM notes ORDER BY conversation_id ASC
    `),
};

// MCP Server Implementation
class StickyNotesServer {
    private server: Server;
    private webSocketServer: NotesWebSocketServer;
    private expressApp: express.Express;
    private db: Database.Database;
    private exportService: ExportService;

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

        this.expressApp = express();
        this.db = db;
        this.exportService = new ExportService();
        this.webSocketServer = new NotesWebSocketServer(this.db);

        // Error handling
        this.server.onerror = (error: any) => console.error('[MCP Error]', error);
        process.on('SIGINT', async () => {
            await this.cleanup();
            process.exit(0);
        });
    }

    private async initialize() {
        await this.setupExpress();
        await this.setupWebSocket();
        this.setupResourceHandlers();
        this.setupToolHandlers();
    }

    async run() {
        const transport = new StdioServerTransport();
        await this.initialize();
        await this.server.connect(transport);
        console.error('Sticky Notes MCP server running on stdio');
    }

    private async setupExpress() {
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
                const {
                    search,
                    page = 1,
                    limit = 10,
                    tags,
                    conversation,
                    color,
                    startDate,
                    sort = 'updated_at DESC'
                } = req.query;
                const offset = (Number(page) - 1) * Number(limit);

                console.error('Query parameters:', {
                    search,
                    page,
                    limit,
                    tags,
                    conversation,
                    color,
                    startDate,
                    sort
                });

                const transaction = db.transaction(() => {
                    // Base query with all necessary joins
                    let baseQuery = 'SELECT notes.* FROM notes';
                    const params: any[] = [];
                    const conditions: string[] = [];

                    // Handle tag filtering
                    if (tags) {
                        let tagArray: string[];

                        if (typeof tags === 'string') {
                            // If tags is a string, convert it to an array
                            tagArray = [tags];
                        } else if (Array.isArray(tags)) {
                            // If tags is already an array, ensure all elements are strings
                            tagArray = tags.map(tag => String(tag));
                        } else {
                            // Handle unexpected tag format
                            console.error("Unexpected tags format:", tags);
                            tagArray = [];
                        }

                        if (tagArray.length > 0) {
                            const existsSubquery = `
                                EXISTS (
                                    SELECT 1
                                    FROM note_tags
                                    JOIN tags ON note_tags.tag_id = tags.id
                                    WHERE note_tags.note_id = notes.id
                                    AND tags.name IN (${tagArray.map(() => '?').join(', ')})
                                )
                            `;
                            conditions.push(existsSubquery);
                            params.push(...tagArray);
                        }
                    }

                    // Simple equality filters
                    if (typeof conversation === 'string' && conversation.trim()) {
                        conditions.push('notes.conversation_id = ?');
                        params.push(conversation.trim());
                    }

                    if (typeof color === 'string' && color.trim()) {
                        conditions.push('notes.color_hex = ?');
                        params.push(color.trim());
                    }

                    // Date filter
                    if (startDate) {
                        conditions.push('notes.created_at >= ?');
                        params.push(startDate);
                    }

                    // Search filter
                    if (typeof search === 'string' && search.trim()) {
                        conditions.push('(notes.title LIKE ? OR notes.content LIKE ?)');
                        const searchTerm = `%${search.trim()}%`;
                        params.push(searchTerm, searchTerm);
                    }

                    // Add WHERE clause if we have conditions
                    if (conditions.length > 0) {
                        baseQuery += ' WHERE ' + conditions.join(' AND ');
                    }

                    // Handle sorting
                    const validSortFields = ['title', 'updated_at', 'created_at', 'color_hex', 'conversation_id'];
                    const validSortDirections = ['ASC', 'DESC'];

                    let sortField = 'updated_at';
                    let sortDirection = 'DESC';

                    if (typeof sort === 'string') {
                        const [field, direction] = sort.split(' ');
                        if (field && validSortFields.includes(field.toLowerCase())) {
                            sortField = field.toLowerCase();
                        }
                        if (direction && validSortDirections.includes(direction.toUpperCase())) {
                            sortDirection = direction.toUpperCase();
                        }
                    }

                    // Add sorting and pagination
                    baseQuery += ` ORDER BY notes.${sortField} ${sortDirection} LIMIT ? OFFSET ?`;
                    params.push(Number(limit), offset);

                    // Log the final query and parameters
                    console.error('Query:', baseQuery);
                    console.error('Parameters:', params);

                    // Execute the query
                    const notes = db.prepare(baseQuery).all(...params) as Note[];

                    // If no notes found, return early
                    if (notes.length === 0) {
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

                    // Count query uses the same conditions
                    let countQuery = 'SELECT COUNT(DISTINCT notes.id) as total FROM notes';
                    if (tags) {
                        let tagArray: string[];

                        if (typeof tags === 'string') {
                            tagArray = [tags];
                        } else if (Array.isArray(tags)) {
                            tagArray = tags.map(tag => String(tag));
                        } else {
                            tagArray = [];
                        }

                        if (tagArray.length > 0) {
                            const existsSubquery = `
                                EXISTS (
                                    SELECT 1
                                    FROM note_tags
                                    JOIN tags ON note_tags.tag_id = tags.id
                                    WHERE note_tags.note_id = notes.id
                                    AND tags.name IN (${tagArray.map(() => '?').join(', ')})
                                )
                            `;
                            conditions.push(existsSubquery);
                            params.push(...tagArray);
                        }
                    }

                    if (conditions.length > 0) {
                        countQuery += ' WHERE ' + conditions.join(' AND ');
                    }

                    // Log count query
                    console.error('Count Query:', countQuery);
                    console.error('Count Parameters:', params);

                    const totalResult = db.prepare(countQuery).get(...params.slice(0, -2)) as { total: number };

                    // Fetch tags for all notes in a single query
                    const noteIds = notes.map(note => note.id);
                    const tagQuery = `
                        SELECT note_tags.note_id, tags.name 
                        FROM note_tags 
                        JOIN tags ON note_tags.tag_id = tags.id 
                        WHERE note_tags.note_id IN (${noteIds.map(() => '?').join(',')})
                    `;

                    const tagResults = db.prepare(tagQuery).all(...noteIds) as { note_id: number; name: string }[];

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
                            total: totalResult?.total || 0,
                            page: Number(page),
                            limit: Number(limit),
                            totalPages: Math.ceil((totalResult?.total || 0) / Number(limit))
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

        this.expressApp.post('/api/notes', async (req: Request, res: Response) => {
            try {
                const note = req.body as Note;
                const result = preparedStatements.insertNote.run({
                    title: note.title,
                    content: note.content,
                    conversationId: note.conversation_id,
                    color_hex: note.color_hex || null
                });

                const id = result.lastInsertRowid;
                const noteCount = this.getConversationNoteCount(note.conversation_id);
                this.webSocketServer.broadcastConversationUpdate({
                    conversation_id: note.conversation_id,
                    note_count: noteCount
                });

                // Handle WebSocket broadcasts
                if (note.tags && note.tags.length > 0) {
                    for (const tagName of note.tags) {
                        let tag = preparedStatements.getTagByName.get({ name: tagName }) as TagRecord;
                        if (!tag) {
                            const result = preparedStatements.insertTag.run({ name: tagName });
                            tag = { id: result.lastInsertRowid as number, name: tagName };
                            this.webSocketServer.broadcastTagCreation({
                                name: tagName,
                                note_count: 1
                            });
                        } else {
                            const tagCount = this.getTagNoteCount(tagName);
                            this.webSocketServer.broadcastTagUpdate({
                                name: tagName,
                                note_count: tagCount
                            });
                        }
                    }
                }

                res.status(201).json({ success: true, id });
            } catch (error) {
                console.error('Error creating note:', error);
                res.status(500).json({ success: false, error: 'Failed to create note' });
            }
        });

        this.expressApp.put('/api/notes/:id', async (req: Request, res: Response) => {
            try {
                const { id } = req.params;
                const note = req.body as Note;

                preparedStatements.updateNote.run({ id, content: note.content });

                if (note.tags) {
                    // Handle tag updates through WebSocket
                    const existingTags = preparedStatements.getTagsByNoteId.all({ note_id: id }) as { name: string }[];
                    const existingTagNames = existingTags.map(t => t.name);
                    const newTags = note.tags.filter(tag => !existingTagNames.includes(tag));
                    const removedTags = existingTagNames.filter(tag => !note.tags!.includes(tag));

                    for (const tagName of newTags) {
                        let tag = preparedStatements.getTagByName.get({ name: tagName }) as TagRecord;
                        if (!tag) {
                            const result = preparedStatements.insertTag.run({ name: tagName });
                            tag = { id: result.lastInsertRowid as number, name: tagName };
                            this.webSocketServer.broadcastTagCreation({
                                name: tagName,
                                note_count: 1
                            });
                        }
                        const tagCount = this.getTagNoteCount(tagName);
                        this.webSocketServer.broadcastTagUpdate({
                            name: tagName,
                            note_count: tagCount
                        });
                    }

                    for (const tagName of removedTags) {
                        const tagCount = this.getTagNoteCount(tagName);
                        this.webSocketServer.broadcastTagUpdate({
                            name: tagName,
                            note_count: tagCount
                        });
                    }
                }

                res.json({ success: true, id });
            } catch (error) {
                console.error('Error updating note:', error);
                res.status(500).json({ success: false, error: 'Failed to update note' });
            }
        });

        this.expressApp.delete('/api/notes/:id', (async (req: Request, res: Response, next: NextFunction) => {
            try {
                const { id } = req.params;
                const note = preparedStatements.getNoteById.get({ id }) as Note;
                if (!note) {
                    return res.status(404).json({ success: false, error: 'Note not found' });
                }

                const tags = preparedStatements.getTagsByNoteId.all({ note_id: id }) as { name: string }[];
                preparedStatements.deleteNote.run({ id });

                // Broadcast note deletion
                this.webSocketServer.broadcastNoteDeleted(note);

                // Update conversation count
                const conversationCount = this.getConversationNoteCount(note.conversation_id);
                this.webSocketServer.broadcastConversationUpdate({
                    conversation_id: note.conversation_id,
                    note_count: conversationCount
                });

                // Update tag counts
                for (const tag of tags) {
                    const tagCount = this.getTagNoteCount(tag.name);
                    this.webSocketServer.broadcastTagUpdate({
                        name: tag.name,
                        note_count: tagCount
                    });
                }

                res.json({ success: true });
            } catch (error) {
                console.error('Error deleting note:', error);
                res.status(500).json({ success: false, error: 'Failed to delete note' });
            }
        }) as RequestHandler);

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

        // Add bulk color update endpoint
        this.expressApp.patch('/api/notes/bulk/color', ((req: Request, res: Response, next: NextFunction) => {
            try {
                const { noteIds, color_hex } = req.body;

                if (!Array.isArray(noteIds) || !color_hex) {
                    return res.status(400).json({ error: 'Invalid request parameters' });
                }

                const updateStmt = db.prepare(`
                    UPDATE notes 
                    SET color_hex = ?,
                        updated_at = strftime('%s', 'now')
                    WHERE id = ?
                `);

                db.transaction(() => {
                    for (const id of noteIds) {
                        updateStmt.run(color_hex, id);
                    }
                })();

                res.json({ success: true });
            } catch (error) {
                next(error);
            }
        }) as RequestHandler);

        // Add markdown rendering endpoint
        this.expressApp.post('/api/markdown/render', (req: Request, res: Response) => {
            try {
                const { content } = req.body;
                if (!content || typeof content !== 'string') {
                    res.status(400).json({ error: 'Invalid content' });
                    return;
                }

                const html = renderMarkdown(content);
                res.json({ html });
            } catch (error) {
                console.error('Error rendering markdown:', error);
                res.status(500).json({ error: 'Failed to render markdown' });
            }
        });

        // Add after other API routes
        this.expressApp.post('/api/notes/export', (async (req: Request, res: Response, next: NextFunction) => {
            try {
                const { noteIds } = req.body;

                if (!Array.isArray(noteIds) || noteIds.length === 0) {
                    return res.status(400).json({ error: 'Invalid note IDs' });
                }

                // Fetch notes with their tags
                const notes = noteIds.map(id => {
                    const note = db.prepare(`
                        SELECT notes.*, GROUP_CONCAT(tags.name) as tag_list 
                        FROM notes 
                        LEFT JOIN note_tags ON notes.id = note_tags.note_id 
                        LEFT JOIN tags ON note_tags.tag_id = tags.id 
                        WHERE notes.id = ?
                        GROUP BY notes.id
                    `).get(id) as Note & { tag_list: string | null };

                    if (!note) {
                        throw new Error(`Note with ID ${id} not found`);
                    }

                    return {
                        ...note,
                        tags: note.tag_list ? note.tag_list.split(',') : []
                    } as Note;
                });

                // Generate markdown content
                let markdown = '';

                if (notes.length === 1) {
                    const note = notes[0];
                    markdown = this.exportService.exportNote(note, {
                        includeMetadata: true,
                        format: 'md'
                    });
                } else {
                    markdown = this.exportService.exportNotes(notes, {
                        includeMetadata: true,
                        format: 'md'
                    });
                }

                // Set headers for file download
                res.setHeader('Content-Type', 'text/markdown');
                res.setHeader('Content-Disposition', 'attachment; filename="notes.md"');

                res.send(markdown);
            } catch (error) {
                next(error);
            }
        }) as RequestHandler);

        // Root route
        this.expressApp.get('/', (req: Request, res: Response) => {
            res.sendFile(join(publicPath, 'index.html'));
        });

        // Add conversations endpoint
        this.expressApp.get('/api/conversations', (req: Request, res: Response) => {
            try {
                const rows = preparedStatements.getUniqueConversations.all() as ConversationRow[];
                const conversations = rows.map(row => row.conversation_id);
                res.json({ conversations });
            } catch (error) {
                console.error('Error fetching conversations:', error);
                res.status(500).json({ error: 'Failed to fetch conversations' });
            }
        });

        // Add WebSocket port configuration endpoint
        this.expressApp.get('/api/config/ws-port', async (req: Request, res: Response) => {
            try {
                const port = this.webSocketServer.getCurrentPort();
                if (!port) {
                    throw new Error('WebSocket server not initialized or disabled');
                }
                res.json({ port });
            } catch (error) {
                console.error('Error getting WebSocket port:', error);
                res.status(500).json({ error: 'Failed to get WebSocket port configuration' });
            }
        });

        // Add configuration endpoint
        this.expressApp.get('/api/config', async (req: Request, res: Response) => {
            try {
                res.json({
                    webPort: WEB_UI_PORT,
                    wsPort: this.webSocketServer.getCurrentPort(),
                    dbPath: DB_PATH
                });
            } catch (error) {
                console.error('Error getting configuration:', error);
                res.status(500).json({ error: 'Failed to get server configuration' });
            }
        });

        // Register error handler after all routes
        this.expressApp.use(errorHandler);

        // Find available port starting from configured port
        const port = await findAvailablePort(WEB_UI_PORT);
        if (!port) {
            throw new Error(`Could not find available port after trying ${WEB_UI_PORT} through ${WEB_UI_PORT + 100}`);
        }

        this.expressApp.listen(port, () => {
            console.error(`Web UI running at http://localhost:${port}${port !== WEB_UI_PORT ? ` (original port ${WEB_UI_PORT} was in use)` : ''}`);
        });
    }

    private async setupWebSocket() {
        await this.webSocketServer.initialize();
    }

    private setupResourceHandlers() {
        // List resources handler
        this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
            resources: [],
            tools: []
        }));

        // List resource templates handler
        this.server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
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
            tools: []
        }));

        // Read resource handler
        this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
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
                    tools: []
                };
            } else if (uri.startsWith('note://')) {
                const id = uri.substring('note://'.length);
                const note = preparedStatements.getNoteById.get({ id });
                if (!note) {
                    throw new McpError(ErrorCode.InvalidParams, `Note with id ${id} not found`);
                }
                return {
                    contents: [{
                        uri: uri,
                        mimeType: 'application/json',
                        text: JSON.stringify(note, null, 2),
                    }],
                    tools: []
                };
            } else {
                throw new McpError(ErrorCode.InvalidParams, `Invalid URI: ${uri}`);
            }
        });
    }

    private setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: 'create-note',
                    description: 'Creates a new note',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            title: { type: 'string' },
                            content: { type: 'string' },
                            conversationId: { type: 'string' },
                            tags: { type: 'array', items: { type: 'string' } },
                            color_hex: { type: 'string' }
                        },
                        required: ['title', 'content', 'conversationId']
                    }
                },
                {
                    name: 'update-note',
                    description: 'Updates an existing note',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            content: { type: 'string' }
                        },
                        required: ['id', 'content']
                    }
                },
                {
                    name: 'delete-note',
                    description: 'Deletes a note',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' }
                        },
                        required: ['id']
                    }
                }
            ]
        }));

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            if (!request.params?.name) {
                throw new McpError(ErrorCode.InvalidParams, 'Tool name is required');
            }

            switch (request.params.name) {
                case 'create-note': {
                    const { title, content, conversationId, tags, color_hex } = request.params.arguments as any;
                    try {
                        const result = preparedStatements.insertNote.run({
                            title,
                            content,
                            conversationId,
                            color_hex: color_hex || null
                        });
                        const id = result.lastInsertRowid;

                        // Broadcast note creation via WebSocket
                        const newNote = {
                            id,
                            title,
                            content,
                            conversation_id: conversationId,
                            color_hex,
                            tags,
                            created_at: Math.floor(Date.now() / 1000),
                            updated_at: Math.floor(Date.now() / 1000)
                        };
                        this.webSocketServer.broadcastNoteCreation(newNote);

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
                    const { id, content } = request.params.arguments as any;
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
                    const { id } = request.params.arguments as any;
                    try {
                        const note = preparedStatements.getNoteById.get({ id }) as Note;
                        if (!note) {
                            throw new McpError(ErrorCode.InvalidParams, `Note with id ${id} not found`);
                        }

                        const tags = preparedStatements.getTagsByNoteId.all({ note_id: id }) as { name: string }[];
                        preparedStatements.deleteNote.run({ id });

                        // Broadcast note deletion
                        this.webSocketServer.broadcastNoteDeleted(note);

                        // Update conversation count
                        const conversationCount = this.getConversationNoteCount(note.conversation_id);
                        this.webSocketServer.broadcastConversationUpdate({
                            conversation_id: note.conversation_id,
                            note_count: conversationCount
                        });

                        // Update tag counts
                        for (const tag of tags) {
                            const tagCount = this.getTagNoteCount(tag.name);
                            this.webSocketServer.broadcastTagUpdate({
                                name: tag.name,
                                note_count: tagCount
                            });
                        }

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

                default:
                    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
            }
        });
    }

    private async getAllNotes(): Promise<NoteWithMetadata[]> {
        const query = `
            SELECT 
                id,
                title,
                content,
                conversation_id as conversationId,
                created_at as createdAt,
                updated_at as updatedAt
            FROM notes
        `;
        return this.db.prepare(query).all() as NoteWithMetadata[];
    }

    private async cleanup() {
        await this.webSocketServer.shutdown();
        await this.server.close();
    }

    // Add helper functions for note counts
    private getConversationNoteCount(conversationId: string): number {
        const result = db.prepare(`
            SELECT COUNT(*) as count 
            FROM notes 
            WHERE conversation_id = ?
        `).get(conversationId) as CountResult;
        return result.count;
    }

    private getTagNoteCount(tagName: string): number {
        const result = db.prepare(`
            SELECT COUNT(*) as count 
            FROM note_tags 
            JOIN tags ON tags.id = note_tags.tag_id 
            WHERE tags.name = ?
        `).get(tagName) as CountResult;
        return result.count;
    }
}

const server = new StickyNotesServer();
server.run().catch((error) => {
    console.error("Fatal error running server:", error);
    process.exit(1);
});
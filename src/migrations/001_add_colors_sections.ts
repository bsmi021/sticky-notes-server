import Database from 'better-sqlite3';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';

// Get the database path
const DB_PATH = join(process.env.USERPROFILE || process.env.HOME || '', 'Documents', 'sticky-notes.db');

export async function migrate() {
    console.log('Starting migration: Adding colors and sections support...');

    // Create backup
    console.log('Creating database backup...');
    await fs.copyFile(DB_PATH, `${DB_PATH}.backup-${Date.now()}`);

    // Initialize database connection
    const db = new Database(DB_PATH, {
        fileMustExist: true,
        timeout: 5000
    });

    try {
        // Begin transaction
        db.exec('BEGIN TRANSACTION;');

        // Add new columns to notes table
        console.log('Adding new columns to notes table...');
        db.exec(`
            ALTER TABLE notes ADD COLUMN color_hex VARCHAR(7) DEFAULT '#FFE999';
            ALTER TABLE notes ADD COLUMN section_id INTEGER REFERENCES sections(id) ON DELETE SET NULL;
        `);

        // Create sections table
        console.log('Creating sections table...');
        db.exec(`
            CREATE TABLE IF NOT EXISTS sections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                order_index INTEGER NOT NULL,
                created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
                updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
            );
        `);

        // Add parent_id to tags for hierarchy
        console.log('Adding parent_id to tags table...');
        db.exec(`
            ALTER TABLE tags ADD COLUMN parent_id INTEGER REFERENCES tags(id) ON DELETE SET NULL;
        `);

        // Add indexes for performance
        console.log('Creating indexes...');
        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_notes_section ON notes(section_id);
            CREATE INDEX IF NOT EXISTS idx_tags_parent ON tags(parent_id);
        `);

        // Initialize default section
        console.log('Creating default section...');
        db.exec(`
            INSERT INTO sections (name, order_index) 
            VALUES ('Default', 0);
        `);

        // Update existing notes to use default section
        console.log('Assigning existing notes to default section...');
        db.exec(`
            UPDATE notes 
            SET section_id = (SELECT id FROM sections WHERE name = 'Default')
            WHERE section_id IS NULL;
        `);

        // Commit transaction
        db.exec('COMMIT;');
        console.log('Migration completed successfully!');

    } catch (error) {
        // Rollback on error
        db.exec('ROLLBACK;');
        console.error('Migration failed:', error);
        throw error;
    } finally {
        // Close database connection
        db.close();
    }
} 
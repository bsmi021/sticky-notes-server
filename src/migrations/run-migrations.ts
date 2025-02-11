#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { migrate as migrateColorsAndSections } from './001_add_colors_sections.js';

const __filename = fileURLToPath(import.meta.url);

async function runMigrations() {
    console.log('Starting migrations...');

    try {
        // Run migrations in order
        await migrateColorsAndSections();

        console.log('All migrations completed successfully!');
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

// Run migrations if this file is executed directly
if (process.argv[1] === __filename) {
    runMigrations().catch(console.error);
} 
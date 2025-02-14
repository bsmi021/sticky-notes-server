import { renderMarkdown, renderMarkdownWithToc } from '../utils/markdown.js';

interface ExportOptions {
    includeMetadata?: boolean;
    includeToc?: boolean;
    format?: 'md' | 'html';
}

interface Note {
    id: number;
    title: string;
    content: string;
    conversation_id: string;
    created_at: number;
    updated_at: number;
    tags?: string[];
}

export class ExportService {
    /**
     * Exports a single note to markdown or HTML format
     */
    public exportNote(note: Note, options: ExportOptions = {}): string {
        const { includeMetadata = true, includeToc = false, format = 'md' } = options;

        let content = '';

        // Add title
        content += `# ${note.title}\n\n`;

        // Add metadata if requested
        if (includeMetadata) {
            content += '## Metadata\n\n';
            content += `- Created: ${new Date(note.created_at * 1000).toISOString()}\n`;
            content += `- Updated: ${new Date(note.updated_at * 1000).toISOString()}\n`;
            if (note.tags && note.tags.length > 0) {
                content += `- Tags: ${note.tags.join(', ')}\n`;
            }
            content += '\n';
        }

        // Add table of contents if requested
        if (includeToc) {
            content += '[[toc]]\n\n';
        }

        // Add main content
        content += `${note.content}\n`;

        // Convert to HTML if requested
        if (format === 'html') {
            return includeToc ? renderMarkdownWithToc(content) : renderMarkdown(content);
        }

        return content;
    }

    /**
     * Exports multiple notes to a single markdown or HTML document
     */
    public exportNotes(notes: Note[], options: ExportOptions = {}): string {
        const { includeMetadata = true, includeToc = false, format = 'md' } = options;

        let content = '# Exported Notes\n\n';

        if (includeToc) {
            content += '[[toc]]\n\n';
        }

        // Add each note as a section
        notes.forEach((note, index) => {
            content += `## ${note.title}\n\n`;

            if (includeMetadata) {
                content += '### Metadata\n\n';
                content += `- Created: ${new Date(note.created_at * 1000).toISOString()}\n`;
                content += `- Updated: ${new Date(note.updated_at * 1000).toISOString()}\n`;
                if (note.tags && note.tags.length > 0) {
                    content += `- Tags: ${note.tags.join(', ')}\n`;
                }
                content += '\n';
            }

            content += `${note.content}\n\n`;

            // Add separator between notes, except for the last one
            if (index < notes.length - 1) {
                content += '---\n\n';
            }
        });

        // Convert to HTML if requested
        if (format === 'html') {
            return includeToc ? renderMarkdownWithToc(content) : renderMarkdown(content);
        }

        return content;
    }
} 
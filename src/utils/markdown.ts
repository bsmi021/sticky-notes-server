import { marked, Renderer } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js';
import MarkdownIt from 'markdown-it';
import markdownItAnchor from 'markdown-it-anchor';
import markdownItToc from 'markdown-it-table-of-contents';
import { JSDOM } from 'jsdom';

// Initialize DOMPurify with a DOM environment for server-side rendering
const window = new JSDOM('').window;
const purify = DOMPurify(window);

// Configure marked options with proper types
const renderer = new Renderer();

// Override header renderer to add proper classes
renderer.heading = function (text: string, level: number): string {
    return `<h${level} class="prose-h${level}">${text}</h${level}>`;
};

// Override the code renderer
renderer.code = function (code: string, language: string | undefined, isEscaped: boolean): string {
    if (language && hljs.getLanguage(language)) {
        try {
            const highlighted = hljs.highlight(code, { language }).value;
            return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`;
        } catch (err) {
            console.error('Error highlighting code:', err);
        }
    }
    return `<pre><code>${isEscaped ? code : escape(code)}</code></pre>`;
};

marked.setOptions({
    renderer,
    gfm: true,
    breaks: true,
    headerIds: true,
});

// Configure markdown-it instance
const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    highlight: (code: string, lang: string): string => {
        if (lang && hljs.getLanguage(lang)) {
            try {
                return hljs.highlight(code, { language: lang }).value;
            } catch (err) {
                console.error('Error highlighting code:', err);
            }
        }
        return code;
    },
})
    .use(markdownItAnchor)
    .use(markdownItToc);

// Helper function to escape HTML
function escape(html: string): string {
    return html
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Function to render markdown content safely
export const renderMarkdown = (content: string): string => {
    // First pass: Convert markdown to HTML using marked
    const rawHtml = marked.parse(content);
    if (typeof rawHtml !== 'string') {
        throw new Error('Unexpected non-string output from marked.parse');
    }

    // Second pass: Sanitize the HTML
    const sanitizedHtml = purify.sanitize(rawHtml, {
        ALLOWED_TAGS: [
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'p', 'br', 'hr',
            'ul', 'ol', 'li',
            'strong', 'em', 'del',
            'code', 'pre',
            'a', 'img',
            'blockquote',
            'table', 'thead', 'tbody', 'tr', 'th', 'td',
            'div', 'span'
        ],
        ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'id'],
        ALLOW_DATA_ATTR: false,
    });

    return sanitizedHtml;
};

// Function to render markdown content with Table of Contents
export const renderMarkdownWithToc = (content: string): string => {
    return md.render(content);
};

// Function to get plain text from markdown
export const getPlainTextFromMarkdown = (content: string): string => {
    const html = marked.parse(content);
    if (typeof html !== 'string') {
        throw new Error('Unexpected non-string output from marked.parse');
    }
    const dom = new JSDOM(html);
    return dom.window.document.body.textContent || '';
};

// Export configured instances for direct use
export { marked, md }; 
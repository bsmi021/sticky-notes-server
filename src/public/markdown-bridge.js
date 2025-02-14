// Markdown rendering bridge
window.renderMarkdown = async (content) => {
    try {
        const response = await fetch('/api/markdown/render', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ content }),
        });

        if (!response.ok) {
            throw new Error('Failed to render markdown');
        }

        const { html } = await response.json();
        return html;
    } catch (error) {
        console.error('Error rendering markdown:', error);
        return content; // Fallback to plain text
    }
}; 
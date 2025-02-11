# Sticky Notes MCP Server

A MCP (Model Context Protocol) server for managing sticky notes. This project provides both an MCP interface and a fully-featured REST API to create, update, delete, search, and manage notes, tags, and sections. It also serves a React-based UI for interacting with your sticky notes.

---

## Features

- **MCP Development**: Implements MCP protocol endpoints and tool handlers (e.g., create-note, update-note, delete-note, search-notes, list-conversations).
- **REST API**: Supports full CRUD operations for notes, sections, and tags via Express.
- **WebSocket Support**: Real-time capabilities through a built-in WebSocket server (listening on port 8080).
- **Full-Text Search**: Leverages SQLite FTS5 for efficient note searches.
- **Tag Management**: Hierarchical tag system with parent-child relationships.
- **Section Organization**: Group notes into customizable sections.
- **Color Coding**: Support for color-coded notes and bulk color operations.
- **Persistency**: Uses SQLite (via better-sqlite3) for local storage. The default database is created in the user's home directory.
- **UI Integration**: Serves a React-based user interface from the `/public` folder on port 3000.

---

## Requirements

- Node.js (v16 or later recommended)
- npm (or pnpm)
- SQLite (no additional installation required since it uses better-sqlite3, which bundles SQLite)

---

## Installation & Setup

1. **Clone the Repository**

   ```bash
   git clone https://your.repo.url/sticky-notes-server.git
   cd sticky-notes-server
   ```

2. **Install Dependencies**

   ```bash
   npm install
   ```

3. **(Optional) Build the Project**

   If you are using a build step (for example, if you compile TypeScript), run:

   ```bash
   npm run build
   ```

4. **Independently Run**

  If you want to run the server independently, you can use the following command:

  ```npm run start```
  
---

## Configuration

### Environment Variables

- `DB_ROOT`: The root directory for the database file (defaults to user's home directory)
- `WEB_UI_PORT`: Port for the web UI (defaults to 3000)
- `WS_PORT`: Port for WebSocket server (defaults to 8080)
- `NODE_ENV`: Set to 'development' for verbose logging

### Database

The server uses SQLite for data persistence. By default, the database file (`sticky-notes.db`) is created in your home directory. You can override this behavior by setting the `DB_ROOT` environment variable.

### Ports

- **Web UI**: Runs on port `3000` (configurable via `WEB_UI_PORT`)
- **WebSocket Server**: Runs on port `8080` (configurable via `WS_PORT`)

---

## Running the Server

To start the Sticky Notes MCP Server, run:

```bash
npm start
```

This will:

- Start the MCP server using a standard I/O transport
- Launch an Express web server serving the UI on [http://localhost:3000](http://localhost:3000)
- Initialize the WebSocket server on port 8080
- Set up the SQLite database with all necessary tables and indexes

Press `Ctrl+C` to stop the server.

---

## MCP Tools

The server provides several MCP tools for interacting with notes:

### create-note

Creates a new note with optional tags.

```json
{
  "name": "create-note",
  "arguments": {
    "title": "Meeting Notes",
    "content": "Discussed Q4 plans.",
    "conversationId": "conv123",
    "tags": ["meeting", "planning"]
  }
}
```

### update-note

Updates an existing note's content.

```json
{
  "name": "update-note",
  "arguments": {
    "id": "123",
    "content": "Updated meeting notes content"
  }
}
```

### delete-note

Deletes a specific note.

```json
{
  "name": "delete-note",
  "arguments": {
    "id": "123"
  }
}
```

### search-notes

Searches for notes based on various criteria.

```json
{
  "name": "search-notes",
  "arguments": {
    "query": "meeting",
    "tags": ["important"],
    "conversationId": "conv123"
  }
}
```

### list-conversations

Returns a distinct list of all conversation IDs in the system.

```json
{
  "name": "list-conversations",
  "arguments": {}
}
```

Response example:

```json
[
  "conv123",
  "meeting-2024",
  "project-x"
]
```

---

## REST API Endpoints

The server exposes several REST endpoints:

### Notes Endpoints

- **GET /api/notes**
  - Query parameters:
    - `search`: Text search query
    - `tags`: Array of tag names
    - `conversation`: Conversation ID
    - `color`: Color hex code
    - `startDate`: Filter by creation date
    - `page`: Page number (default: 1)
    - `limit`: Items per page (default: 10)
    - `sort`: Sort field and direction (e.g., "updated_at DESC")

- **POST /api/notes**

  ```json
  {
    "title": "Meeting Notes",
    "content": "Discussed Q4 plans.",
    "conversation_id": "conv123",
    "tags": ["meeting", "planning"],
    "color_hex": "#FFA500",
    "section_id": 1
  }
  ```

- **PUT /api/notes/:id**
- **DELETE /api/notes/:id**
- **PATCH /api/notes/:id/color**
- **PATCH /api/notes/:id/section**
- **PATCH /api/notes/bulk/color**

### Sections Endpoints

- **GET /api/sections**
- **POST /api/sections**
- **PUT /api/sections/:id**
- **DELETE /api/sections/:id**
- **GET /api/sections/:id/notes**

### Tags Endpoints

- **GET /api/tags**
- **GET /api/tags/hierarchy**
- **PATCH /api/tags/:id/parent**

---

## Integration with Claude Desktop

### Method 1: Direct Integration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "stickyNotes": {
      "command": "node",
      "args": ["path/to/sticky-notes-server/build/index.js"],
      "env": {
        "DB_ROOT": "desired/db/location",
        "WEB_UI_PORT": "3000",
        "WS_PORT": "8080"
      }
    }
  }
}
```

### Method 2: NPX Integration

If published as an NPX package (Not implemented yet):

```json
{
  "mcpServers": {
    "stickyNotes": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/sticky-notes-server"
      ],
      "env": {
        "DB_ROOT": "desired/db/location"
      }
    }
  }
}
```

---

## Development

### Project Structure

```
sticky-notes-server/
├── package.json
├── tsconfig.json
├── README.md
└── src/
    ├── index.ts            // MCP server main entry point
    ├── public/             // React-based UI
    │   ├── index.html
    │   ├── app.js
    │   └── components/     // React components
    └── migrations/         // Database migrations
```

### Development Commands

- **Start in Development Mode**:

  ```bash
  npm run dev
  ```

- **Build for Production**:

  ```bash
  npm run build
  npm start
  ```

### Database Schema

The server uses the following main tables:

- `notes`: Stores note content and metadata
- `sections`: Manages note organization
- `tags`: Stores tag hierarchy
- `note_tags`: Junction table for note-tag relationships
- `notes_fts`: Full-text search virtual table

---

## Troubleshooting

Common issues and solutions:

1. **Database Location Issues**
   - Ensure `DB_ROOT` environment variable is set correctly
   - Check file permissions in the target directory

2. **Port Conflicts**
   - Verify ports 3000 and 8080 are available
   - Use `WEB_UI_PORT` and `WS_PORT` to configure alternative ports

3. **Performance Issues**
   - The server uses SQLite optimizations including WAL mode
   - Indexes are automatically created for common queries
   - Consider regular database maintenance (VACUUM) for large datasets

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

---

## License

This project is licensed under the [MIT License](LICENSE).

---

## Support

For issues, questions, or contributions:

1. Check the [Issues](https://github.com/your-repo/sticky-notes-server/issues) section
2. Create a new issue if needed
3. Join our community discussions

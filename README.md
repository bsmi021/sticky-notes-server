# Sticky Notes MCP Server

A MCP (Model Context Protocol) server for managing sticky notes. This project provides both an MCP interface and a fully-featured REST API to create, update, delete, search, and manage notes, tags, and sections. It also serves a React-based UI for interacting with your sticky notes.

---

## Features

- **MCP Development**: Implements MCP protocol endpoints and tool handlers (e.g., create-note, update-note, delete-note, search-notes, list-conversations).
- **REST API**: Supports full CRUD operations for notes, sections, and tags via Express.
- **WebSocket Support**: Optional real-time capabilities through a built-in WebSocket server.
- **Full-Text Search**: Optional SQLite FTS5 for efficient note searches.
- **Tag Management**: Hierarchical tag system with parent-child relationships.
- **Section Organization**: Group notes into customizable sections.
- **Color Coding**: Support for color-coded notes and bulk color operations.
- **Persistency**: Uses SQLite (via better-sqlite3) for local storage.
- **UI Integration**: Serves a React-based user interface from the `/public` folder.
- **Port Scanning**: Automatically finds available ports if configured ports are in use.

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

3. **Build the Project**

   ```bash
   npm run build
   ```

4. **Run the Server**

   ```bash
   npm start
   ```

---

## Configuration

The server supports a flexible configuration system with three levels of precedence (highest to lowest):

1. **Environment Variables**
2. **Configuration File**
3. **Default Values**

### Environment Variables

- `STICKY_NOTES_CONFIG`: Path to custom config file location
- `DB_ROOT`: The root directory for the database file
- `DB_PATH`: The database file name
- `DB_TIMEOUT`: Database operation timeout in milliseconds
- `DB_VERBOSE`: Enable verbose database logging ('true'/'false')
- `WEB_UI_PORT`: Port for the web UI
- `WS_PORT`: Port for WebSocket server
- `ENABLE_WEBSOCKET`: Enable/disable WebSocket support ('true'/'false')
- `ENABLE_FTS`: Enable/disable full-text search ('true'/'false')

### Configuration File

The server looks for a configuration file in the following locations (in order):

1. Path specified in `STICKY_NOTES_CONFIG` environment variable
2. `.sticky-notes.config.json` in the current working directory
3. `.sticky-notes.config.json` in the user's home directory
4. `/etc/sticky-notes/config.json` (non-Windows systems only)

Example configuration file:

```json
{
    "db": {
        "root": "C:/Users/username/Documents",
        "path": "sticky-notes.db",
        "timeout": 10000,
        "verbose": false
    },
    "server": {
        "webUiPort": 3088,
        "wsPort": 8089
    },
    "features": {
        "enableWebsocket": false,
        "enableFTS": true
    }
}
```

### Default Configuration

If no configuration is provided, the server uses these defaults:

```json
{
    "db": {
        "root": "<user home directory>",
        "path": "sticky-notes.db",
        "timeout": 10000,
        "verbose": false (true in development)
    },
    "server": {
        "webUiPort": 3000,
        "wsPort": 8080
    },
    "features": {
        "enableWebsocket": true,
        "enableFTS": true
    }
}
```

### Port Handling

If a configured port is in use, the server will:

1. Attempt to find the next available port (scanning up to 100 ports higher)
2. Log a message indicating the actual port being used
3. Continue normal operation on the new port

For example, if port 3000 is in use, the server might use 3001 and log:

```
Web UI running at http://localhost:3001 (original port 3000 was in use)
```

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

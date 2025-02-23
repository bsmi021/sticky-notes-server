# Sticky Notes MCP Server

A MCP (Model Context Protocol) server for managing sticky notes. This project provides both an MCP interface and a fully-featured REST API to create, update, delete, search, and manage notes, tags, and sections. It also serves a React-based UI for interacting with your sticky notes.

## UI Overview

![Sticky Notes UI](images/2025-02-18_13-53-38.png)

The Sticky Notes UI provides a modern, intuitive interface for managing your notes:

- **Left Sidebar**: Filter and organize notes by conversations, tags, colors, and dates
- **Main Content**: Grid view of notes with markdown rendering and real-time updates
- **About Dialog**: Access server configuration information (Web URL, WebSocket URL, Database location)
- **Theme Support**: Toggle between light and dark modes
- **Bulk Actions**: Select multiple notes for batch operations

---

## Features

- **Enhanced WebSocket Support**:
  - Real-time note synchronization
  - Robust reconnection strategy
  - Message queuing for offline handling
  - Connection status management
- **Server Configuration**:
  - About modal with server details
  - Dynamic port assignment
  - Configuration endpoint
- **Theme System**:
  - Light/dark mode support
  - Theme persistence
  - Dynamic theme switching
- **Advanced UI Features**:
  - Markdown preview in editor
  - Bulk actions (delete, color, export)
  - Enhanced filtering and sorting
  - Improved pagination
  - Automatic filter reset when deleting last note in a conversation/tag
- **MCP Development**: Implements MCP protocol endpoints and tool handlers (e.g., create-note, update-note, delete-note, search-notes, list-conversations).
- **REST API**: Supports full CRUD operations for notes, sections, and tags via Express.
- **WebSocket Support**: Optional real-time capabilities through a built-in WebSocket server.
- **Full-Text Search**: Optional SQLite FTS5 for efficient note searches.
- **Tag Management**: Hierarchical tag system with parent-child relationships and improved tag search capabilities.
- **Section Organization**: Group notes into customizable sections.
- **Color Coding**: Support for color-coded notes and bulk color operations.
- **Persistency**: Uses SQLite (via better-sqlite3) for local storage.
- **UI Integration**: Serves a React-based user interface from the `/public` folder.
- **Port Scanning**: Automatically finds available ports if configured ports are in use.
- **Pagination**: Client-side pagination with customizable items per page.
- **Conversations Management**: Enhanced conversation tracking with metadata (total notes, creation date, last update).
- **Markdown Support**: Full markdown rendering for note content with preview capabilities.
- **Advanced Filtering**: Combined filtering by tags, conversations, and text search.
- **Export Capabilities**:
  - Single/multiple note export
  - Markdown format support
  - Custom filename options

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

```bash
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
    "tags": ["meeting", "planning"],
    "color_hex": "#FFE999"
  }
}
```

Required Fields:

- `title`: String (1-100 chars, Generally the name of the conversation)
- `content`: String (markdown supported)
- `conversationId`: String (unique identifier for the conversation, you provide this)

Optional Fields:

- `tags`: Array of strings
- `color_hex`: String (hex color code). Available colors:
  - Yellow: "#FFE999" (default)
  - Green: "#A7F3D0"
  - Blue: "#93C5FD"
  - Red: "#FCA5A5"
  - Purple: "#DDD6FE"
  - Orange: "#FFB17A"

Example response: `Note created with id 123`

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

Searches for notes based on various criteria. Supports combined filtering by tags, conversations, and text search.

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

Returns a list of all conversation IDs in the system with metadata.

```json
{
  "name": "list-conversations",
  "arguments": {}
}
```

Response example:

```json
[
  {
    "conversationId": "conv123",
    "totalNotes": 5,
    "firstCreated": 1707753600,
    "lastUpdated": 1707840000
  },
  {
    "conversationId": "meeting-2024",
    "totalNotes": 3,
    "firstCreated": 1707667200,
    "lastUpdated": 1707753600
  }
]
```

---

## REST API Endpoints

The server exposes several REST endpoints:

### Notes Endpoints

- **GET /api/notes**
  - Query parameters:
    - `search`: Text search query
    - `tags`: Array of tag names (deduplication handled server-side)
    - `conversation`: Conversation ID
    - `color`: Color hex code
    - `startDate`: Filter by creation date
    - `page`: Page number (default: 1)
    - `limit`: Items per page (default: 10)
    - `sort`: Sort field and direction (e.g., "updated_at DESC")
  - Response includes pagination metadata:

    ```json
    {
      "notes": [...],
      "pagination": {
        "total": 100,
        "page": 1,
        "limit": 10,
        "totalPages": 10
      }
    }
    ```

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

### Conversations Endpoints

- **GET /api/conversations**
  - Returns list of conversations with metadata:

    ```json
    {
      "conversations": [
        {
          "conversationId": "conv123",
          "totalNotes": 5,
          "firstCreated": 1707753600,
          "lastUpdated": 1707840000
        }
      ]
    }
    ```

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

```bash
sticky-notes-server/
├── package.json
├── tsconfig.json
├── README.md
└── src/
    ├── index.ts            // MCP server main entry point
    ├── public/             // React-based UI
    │   ├── index.html
    │   ├── app.js
    │   ├── components/     // React components
    │   │   ├── Note.js    // Note component with markdown support
    │   │   ├── PaginationControls.js
    │   │   └── Sidebar.js // Enhanced sidebar with conversations
    │   └── utils/
    │       └── markdown.ts // Markdown rendering utilities
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

## WebSocket Implementation

### Client-Side Integration

The application includes a custom React hook for WebSocket management:

```typescript
const { connectionStatus, sendMessage, lastMessage } = useWebSocket({
    url: `ws://localhost:${wsPort}`,
    onMessage: handleMessage,
    reconnectAttempts: 5,
    reconnectInterval: 1000
});
```

### Message Types

1. **Client Messages**:
   - `NOTE_CREATE`: Create new note
   - `NOTE_UPDATE`: Update existing note
   - `NOTE_DELETE`: Delete note
   - `SYNC_REQUEST`: Request sync

2. **Server Messages**:
   - `NOTE_CREATED`: Broadcast new note
   - `NOTE_UPDATED`: Broadcast update
   - `NOTE_DELETED`: Broadcast deletion
   - `SYNC_RESPONSE`: Sync data
   - `ERROR`: Error information

### Reconnection Strategy

The WebSocket implementation includes a sophisticated reconnection strategy:

- Exponential backoff
- Configurable retry attempts
- Connection status tracking
- Message queuing during disconnection

## Theme System

The application includes a comprehensive theme system:

```javascript
const ThemeProvider = ({ children }) => {
    const [theme, setTheme] = React.useState(() => {
        const savedTheme = localStorage.getItem('theme');
        return savedTheme || 
               (window.matchMedia('(prefers-color-scheme: dark)').matches 
                ? 'dark' : 'light');
    });
    // ... theme logic
};
```

### Theme Features

- System preference detection
- Local storage persistence
- Dynamic CSS class switching
- Smooth transitions
- Dark/light mode toggle

## Bulk Actions

The application supports bulk operations:

- **Selection**: Multi-select notes
- **Actions**:
  - Delete multiple notes
  - Change color for multiple notes
  - Export selected notes
- **UI**: Dedicated bulk actions toolbar

## Export Functionality

Enhanced export capabilities:

```javascript
const exportOptions = {
    format: 'md',
    includeMetadata: true,
    includeToc: false,
    filename: 'custom_name.md'
};
```

### Export Features

- Single note export
- Multiple note export
- Custom filename support
- Markdown formatting
- Metadata inclusion options

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

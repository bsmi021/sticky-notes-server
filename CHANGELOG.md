# Changelog

All notable changes to the Sticky Notes MCP Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-02-14

### Added

- Client-side pagination with customizable items per page
- Enhanced conversation management:
  - New `/api/conversations` endpoint with metadata
  - Conversation tracking with total notes count
  - First creation and last update timestamps
  - Improved sidebar organization
- Improved tag search functionality:
  - Server-side tag deduplication
  - Combined filtering with conversations
  - Enhanced query performance
- Full markdown support:
  - Live preview in note editor
  - Markdown rendering in note display
  - Export notes as markdown
- Automatic port scanning functionality when configured ports are in use
- Configuration file support with multiple lookup locations
- Hierarchical configuration system (ENV > Config File > Defaults)
- Optional WebSocket support through configuration
- Optional Full-Text Search (FTS) support through configuration
- Database optimizations (WAL mode, indexes, cache settings)
- Color coding support for notes
- Bulk color update operations
- Section-based note organization
- Hierarchical tag system with parent-child relationships
- REST API endpoints for notes, sections, and tags
- MCP tools for note operations
- React-based web UI
- SQLite database with better-sqlite3
- Basic CRUD operations for notes
- Search functionality
- Conversation management
- Database migrations system

### Changed

- Enhanced pagination response format to include total items and pages
- Improved conversation list endpoint with detailed metadata
- Made WebSocket server optional and configurable
- Made Full-Text Search (FTS) optional and configurable
- Improved configuration system with clear precedence
- Enhanced error handling for database operations
- Optimized database queries with prepared statements
- Added script directory to configuration file lookup paths
- Improved configuration loading feedback with detailed logging

### Fixed

- Tag search parameter handling and deduplication
- Port conflict issues with automatic port scanning
- Database connection handling improvements
- WebSocket server cleanup on shutdown
- Configuration file not being found when server is started with absolute path

## [0.1.0] - 2024-02-12

### Added

- Initial release
- Basic MCP server implementation
- Note creation and management
- SQLite database integration
- Web UI interface
- WebSocket support
- REST API endpoints
- Tag system
- Search functionality

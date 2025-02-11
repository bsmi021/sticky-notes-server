// Theme Context
const ThemeContext = React.createContext();

// Custom hook for Lucide icons
const useLucideIcons = () => {
    React.useEffect(() => {
        const initIcons = () => {
            if (window.lucide) {
                window.lucide.createIcons();
            }
        };

        // Initial creation
        initIcons();

        // Re-run when new elements are added dynamically
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.addedNodes.length > 0) {
                    initIcons();
                }
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        return () => observer.disconnect();
    }, []);
};

const ThemeProvider = ({ children }) => {
    const [theme, setTheme] = React.useState(() => {
        if (typeof window !== 'undefined') {
            const savedTheme = localStorage.getItem('theme');
            if (savedTheme) return savedTheme;
            return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        return 'light';
    });

    React.useEffect(() => {
        const root = document.documentElement;
        root.classList.remove('light', 'dark');
        root.classList.add(theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    const toggleTheme = React.useCallback(() => {
        setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light');
    }, []);

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

// Theme Toggle Component
const ThemeToggle = () => {
    const { theme, toggleTheme } = React.useContext(ThemeContext);
    const isDark = theme === 'dark';

    return (
        <div className="flex items-center gap-2">
            <button
                onClick={toggleTheme}
                className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2"
                style={{
                    backgroundColor: isDark ? 'var(--accent-primary)' : 'var(--bg-tertiary)'
                }}
            >
                <span
                    className={`${isDark ? 'translate-x-6 bg-white' : 'translate-x-1 bg-white'
                        } inline-block h-4 w-4 transform rounded-full transition-transform`}
                />
                <span className="sr-only">Toggle theme</span>
            </button>
            <span className="text-sm">
                {isDark ? 'Dark' : 'Light'}
            </span>
        </div>
    );
};

// Note component
const Note = ({ note, onEdit, onDelete, onColorChange, onTagClick, onConversationClick, isSelected, onSelect }) => {
    const noteColors = [
        { hex: '#FFE999', name: 'Yellow' },
        { hex: '#A7F3D0', name: 'Green' },
        { hex: '#93C5FD', name: 'Blue' },
        { hex: '#FCA5A5', name: 'Red' },
        { hex: '#DDD6FE', name: 'Purple' },
        { hex: '#FFB17A', name: 'Orange' }
    ];

    const baseColor = note.color_hex || noteColors[0].hex;
    const headerColor = `${baseColor}40`; // Slightly darker for header
    const bodyColor = `${baseColor}20`;   // Lighter for content

    return (
        <div
            className={`note w-full h-[320px] rounded-lg shadow-lg transition-all duration-300 ease-in-out hover:-translate-y-1 hover:shadow-xl relative ${isSelected ? 'ring-2 ring-accent-primary' : ''}`}
        >
            {/* Title section with darker background */}
            <div
                className="p-3 border-b cursor-pointer rounded-t-lg flex items-start gap-2"
                style={{ backgroundColor: headerColor, borderColor: baseColor }}
                onClick={() => onEdit(note)}
            >
                {/* Selection checkbox */}
                <div
                    className="flex-shrink-0 cursor-pointer"
                    onClick={(e) => {
                        e.stopPropagation();
                        onSelect(note.id);
                    }}
                >
                    <div className="w-5 h-5 rounded border border-default bg-secondary flex items-center justify-center hover:bg-tertiary">
                        <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => onSelect(note.id)}
                            className="w-4 h-4 rounded accent-accent-primary cursor-pointer"
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>
                </div>

                <div className="flex justify-between items-start flex-1 min-w-0">
                    <h3 className="font-bold text-lg flex-grow pr-4 truncate">{note.title}</h3>
                    <div className="flex space-x-2 flex-shrink-0">
                        <div className="relative group">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                }}
                                className="text-gray-600 hover:text-blue-500 transition-colors"
                                title="Change color"
                            >
                                <i data-lucide="palette" className="w-4 h-4"></i>
                            </button>
                            <div className="absolute right-0 mt-2 bg-white rounded-lg shadow-xl p-2 hidden group-hover:flex flex-wrap gap-1 z-10 w-24">
                                {noteColors.map(color => (
                                    <button
                                        key={color.hex}
                                        className={`w-8 h-8 rounded-full border-2 transition-all ${note.color_hex === color.hex
                                            ? 'border-blue-500 scale-110'
                                            : 'border-transparent'
                                            }`}
                                        style={{ backgroundColor: color.hex }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onColorChange(note.id, color.hex);
                                        }}
                                        title={color.name}
                                    />
                                ))}
                            </div>
                        </div>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete(note.id);
                            }}
                            className="text-gray-600 hover:text-red-500 transition-colors flex items-center gap-1"
                            title="Delete note"
                        >
                            <i data-lucide="trash" className="w-4 h-4"></i>
                        </button>
                    </div>
                </div>
            </div>

            {/* Content section with lighter background */}
            <div
                className="cursor-pointer rounded-b-lg h-[calc(320px-4rem)]"
                style={{ backgroundColor: bodyColor }}
            >
                <div className="h-full overflow-y-auto p-3 flex flex-col">
                    <p className="text-sm mb-2 flex-grow">{note.content}</p>

                    <div className="flex flex-wrap gap-1 mt-2">
                        {note.tags && note.tags.map(tag => (
                            <span
                                key={tag}
                                className="px-2 py-1 bg-white/50 text-xs rounded-full cursor-pointer hover:bg-white/70 transition-colors"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onTagClick(tag);
                                }}
                            >
                                {tag}
                            </span>
                        ))}
                    </div>

                    <div className="text-xs text-tertiary mt-2 flex justify-between">
                        <span>{new Date(note.created_at * 1000).toLocaleDateString()}</span>
                        <span
                            className="text-tertiary hover:text-accent-primary cursor-pointer"
                            onClick={(e) => {
                                e.stopPropagation();
                                onConversationClick(note.conversation_id);
                            }}
                        >
                            {note.conversation_id}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Note Modal component
const NoteModal = ({ note, onClose, onSave }) => {
    const [title, setTitle] = React.useState(note && note.title ? note.title : '');
    const [content, setContent] = React.useState(note && note.content ? note.content : '');
    const [tags, setTags] = React.useState(note && note.tags ? note.tags : []);
    const [newTag, setNewTag] = React.useState('');
    const [conversationId, setConversationId] = React.useState(note && note.conversation_id ? note.conversation_id : 'default');

    const handleSave = () => {
        onSave({
            ...note,
            title,
            content,
            tags,
            conversation_id: conversationId
        });
        onClose();
    };

    const addTag = () => {
        if (newTag && !tags.includes(newTag.trim())) {
            setTags([...tags, newTag.trim()]);
            setNewTag('');
        }
    };

    const removeTag = (tagToRemove) => {
        setTags(tags.filter(tag => tag !== tagToRemove));
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-default w-full max-w-2xl rounded-lg shadow-xl">
                <div className="p-6">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-bold">
                            {note ? 'Edit Note' : 'Create New Note'}
                        </h2>
                        <button
                            onClick={onClose}
                            className="text-tertiary hover:text-primary"
                        >
                            <i data-lucide="x" className="w-6 h-6"></i>
                        </button>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Title</label>
                            <input
                                type="text"
                                placeholder="Note Title"
                                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary bg-secondary border-default"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-1">Content</label>
                            <textarea
                                placeholder="Note Content"
                                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary bg-secondary border-default h-40"
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-1">Conversation ID</label>
                            <input
                                type="text"
                                placeholder="Conversation ID"
                                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary bg-secondary border-default"
                                value={conversationId}
                                onChange={(e) => setConversationId(e.target.value)}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-1">Tags</label>
                            <div className="flex mb-2">
                                <input
                                    type="text"
                                    placeholder="Add Tag"
                                    className="flex-grow px-4 py-2 border rounded-l-lg focus:outline-none focus:ring-2 focus:ring-accent-primary bg-secondary border-default"
                                    value={newTag}
                                    onChange={(e) => setNewTag(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && addTag()}
                                />
                                <button
                                    className="px-4 py-2 bg-accent-primary text-white rounded-r-lg hover:bg-accent-hover"
                                    onClick={addTag}
                                >
                                    Add
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {tags.map(tag => (
                                    <span
                                        key={tag}
                                        className="px-3 py-1 bg-secondary rounded-full flex items-center gap-2"
                                    >
                                        {tag}
                                        <button
                                            onClick={() => removeTag(tag)}
                                            className="text-tertiary hover:text-primary"
                                        >
                                            <i data-lucide="x" className="w-4 h-4"></i>
                                        </button>
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 mt-6">
                        <button
                            className="px-4 py-2 border rounded-lg hover:bg-secondary"
                            onClick={onClose}
                        >
                            Cancel
                        </button>
                        <button
                            className="px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-hover"
                            onClick={handleSave}
                        >
                            Save Note
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Confirmation Dialog Component
const ConfirmDialog = ({ isOpen, message, onConfirm, onCancel }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-[400px] shadow-xl">
                <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">{message}</h3>
                <div className="flex justify-end gap-3">
                    <button
                        className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 rounded"
                        onClick={onCancel}
                    >
                        Cancel
                    </button>
                    <button
                        className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                        onClick={onConfirm}
                    >
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
};

// API Service
const NotesAPI = {
    async fetchNotes(params, signal) {
        const queryParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            if (Array.isArray(value)) {
                value.forEach(v => queryParams.append(key, v));
            } else if (value) {
                queryParams.append(key, value);
            }
        });

        const response = await fetch(`/api/notes?${queryParams}`, { signal });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to fetch notes');
        }
        return response.json();
    },

    async saveNote(noteData, signal) {
        const url = noteData.id ? `/api/notes/${noteData.id}` : '/api/notes';
        const method = noteData.id ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(noteData),
            signal
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to save note');
        }
        return response.json();
    },

    async deleteNote(id, signal) {
        const response = await fetch(`/api/notes/${id}`, {
            method: 'DELETE',
            signal
        });
        if (!response.ok) throw new Error(`Failed to delete note ${id}`);
    },

    async updateNoteColor(noteId, color, signal) {
        const response = await fetch(`/api/notes/${noteId}/color`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ color_hex: color }),
            signal
        });
        if (!response.ok) throw new Error('Failed to update note color');
    }
};

// Custom hooks
const useNotesData = () => {
    const [notes, setNotes] = React.useState([]);
    const [isLoading, setIsLoading] = React.useState(false);
    const [error, setError] = React.useState(null);
    const [filters, setFilters] = React.useState({
        searchTerm: '',
        selectedTags: [],
        selectedConversation: '',
        page: 1,
        limit: 12
    });

    const memoizedFilters = React.useMemo(() => ({
        page: filters.page,
        limit: filters.limit,
        search: filters.searchTerm,
        tags: filters.selectedTags,
        conversation: filters.selectedConversation
    }), [filters.page, filters.limit, filters.searchTerm, filters.selectedTags, filters.selectedConversation]);

    React.useEffect(() => {
        const controller = new AbortController();
        let isMounted = true;

        const fetchData = async () => {
            if (!isMounted) return;
            setIsLoading(true);
            setError(null);

            try {
                const data = await NotesAPI.fetchNotes(memoizedFilters, controller.signal);
                if (isMounted) {
                    setNotes(data.notes || []);
                }
            } catch (error) {
                if (!isMounted) return;
                if (error.name === 'AbortError') return;
                setError(error.message);
                setNotes([]);
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };

        fetchData();

        return () => {
            isMounted = false;
            controller.abort();
        };
    }, [memoizedFilters]);

    const updateFilters = React.useCallback((newFilters) => {
        setFilters(prev => ({
            ...prev,
            ...newFilters,
            page: newFilters.resetPage ? 1 : prev.page
        }));
    }, []);

    const fetchNotes = React.useCallback(() => {
        setFilters(prev => ({ ...prev }));
    }, []);

    return {
        notes,
        isLoading,
        error,
        filters,
        updateFilters,
        fetchNotes
    };
};

// Sidebar Component
const Sidebar = ({ filters, onUpdateFilters, uniqueTags, uniqueConversations }) => {
    const handleTagClick = (tag) => {
        const newTags = filters.selectedTags.includes(tag)
            ? filters.selectedTags.filter(t => t !== tag)
            : [...filters.selectedTags, tag];
        onUpdateFilters({ selectedTags: newTags, resetPage: true });
    };

    const handleConversationClick = (conversationId) => {
        onUpdateFilters({
            selectedConversation: filters.selectedConversation === conversationId ? '' : conversationId,
            resetPage: true
        });
    };

    const resetFilters = () => {
        onUpdateFilters({
            searchTerm: '',
            selectedTags: [],
            selectedConversation: '',
            resetPage: true
        });
    };

    return (
        <div className="w-64 border-r border-default bg-secondary p-4 flex flex-col h-screen sticky top-0">
            <div className="flex items-center justify-between mb-6">
                <h1
                    className="text-xl font-bold cursor-pointer hover:text-accent-primary"
                    onClick={resetFilters}
                    title="Clear all filters"
                >
                    Sticky Notes
                </h1>
                <ThemeToggle />
            </div>

            {/* Search */}
            <div className="mb-6">
                <input
                    type="text"
                    placeholder="Search notes..."
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary bg-secondary border-default"
                    value={filters.searchTerm}
                    onChange={(e) => {
                        onUpdateFilters({ searchTerm: e.target.value, resetPage: true });
                    }}
                />
            </div>

            {/* Conversations Section */}
            <div className="mb-6">
                <h2 className="text-sm font-semibold mb-2">Conversations</h2>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                    <button
                        className={`w-full text-left px-2 py-1.5 rounded text-sm ${!filters.selectedConversation
                            ? 'bg-accent-primary text-white'
                            : 'hover:bg-tertiary'
                            }`}
                        onClick={() => handleConversationClick('')}
                    >
                        All Conversations
                    </button>
                    {uniqueConversations.map(conv => (
                        <button
                            key={conv}
                            className={`w-full text-left px-2 py-1.5 rounded text-sm truncate ${filters.selectedConversation === conv
                                ? 'bg-accent-primary text-white'
                                : 'hover:bg-tertiary'
                                }`}
                            onClick={() => handleConversationClick(conv)}
                            title={conv}
                        >
                            {conv}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tags Section */}
            <div className="mb-6">
                <h2 className="text-sm font-semibold mb-2">Tags</h2>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                    <button
                        className={`w-full text-left px-2 py-1.5 rounded text-sm ${filters.selectedTags.length === 0
                            ? 'bg-accent-primary text-white'
                            : 'hover:bg-tertiary'
                            }`}
                        onClick={() => onUpdateFilters({ selectedTags: [], resetPage: true })}
                    >
                        All Tags
                    </button>
                    {uniqueTags.map(tag => (
                        <button
                            key={tag}
                            className={`w-full text-left px-2 py-1.5 rounded text-sm truncate ${filters.selectedTags.includes(tag)
                                ? 'bg-accent-primary text-white'
                                : 'hover:bg-tertiary'
                                }`}
                            onClick={() => handleTagClick(tag)}
                            title={tag}
                        >
                            {tag}
                        </button>
                    ))}
                </div>
            </div>

            {/* Active Filters */}
            {(filters.selectedTags.length > 0 || filters.selectedConversation || filters.searchTerm) && (
                <div className="mt-auto pt-4 border-t border-default">
                    <h2 className="text-sm font-semibold mb-2">Active Filters</h2>
                    <div className="space-y-2">
                        {filters.searchTerm && (
                            <div className="flex items-center justify-between text-sm bg-tertiary rounded p-2">
                                <span className="truncate flex-1 mr-2">Search: {filters.searchTerm}</span>
                                <button
                                    onClick={() => onUpdateFilters({ searchTerm: '', resetPage: true })}
                                    className="text-primary hover:text-accent-primary flex-shrink-0 p-1 rounded hover:bg-secondary"
                                    title="Remove search filter"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                                        <line x1="18" y1="6" x2="6" y2="18"></line>
                                        <line x1="6" y1="6" x2="18" y2="18"></line>
                                    </svg>
                                </button>
                            </div>
                        )}
                        {filters.selectedTags.map(tag => (
                            <div key={tag} className="flex items-center justify-between text-sm bg-tertiary rounded p-2">
                                <span className="truncate flex-1 mr-2">Tag: {tag}</span>
                                <button
                                    onClick={() => onUpdateFilters({ selectedTags: filters.selectedTags.filter(t => t !== tag), resetPage: true })}
                                    className="text-primary hover:text-accent-primary flex-shrink-0 p-1 rounded hover:bg-secondary"
                                    title="Remove tag filter"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                                        <line x1="18" y1="6" x2="6" y2="18"></line>
                                        <line x1="6" y1="6" x2="18" y2="18"></line>
                                    </svg>
                                </button>
                            </div>
                        ))}
                        {filters.selectedConversation && (
                            <div className="flex items-center justify-between text-sm bg-tertiary rounded p-2">
                                <span className="truncate flex-1 mr-2">Conversation: {filters.selectedConversation}</span>
                                <button
                                    onClick={() => onUpdateFilters({ selectedConversation: '', resetPage: true })}
                                    className="text-primary hover:text-accent-primary flex-shrink-0 p-1 rounded hover:bg-secondary"
                                    title="Remove conversation filter"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                                        <line x1="18" y1="6" x2="6" y2="18"></line>
                                        <line x1="6" y1="6" x2="18" y2="18"></line>
                                    </svg>
                                </button>
                            </div>
                        )}
                        <button
                            onClick={resetFilters}
                            className="w-full px-2 py-1.5 text-sm text-accent-primary hover:text-accent-hover bg-tertiary rounded hover:bg-secondary"
                        >
                            Clear All Filters
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

// NotesGrid Component
const NotesGrid = React.memo(({ notes, onEdit, onDelete, onColorChange, onTagClick, onConversationClick, selectedNotes, onSelectNote }) => {
    if (!notes.length) {
        return (
            <div className="text-center text-gray-500 mt-8">
                No notes found matching your criteria
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {notes.map(note => (
                <Note
                    key={note.id}
                    note={note}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onColorChange={onColorChange}
                    onTagClick={onTagClick}
                    onConversationClick={onConversationClick}
                    isSelected={selectedNotes.has(note.id)}
                    onSelect={onSelectNote}
                />
            ))}
        </div>
    );
});

// Main App Component
const App = () => {
    const {
        notes,
        isLoading,
        error,
        filters,
        updateFilters,
        fetchNotes
    } = useNotesData();

    const [isModalOpen, setIsModalOpen] = React.useState(false);
    const [selectedNote, setSelectedNote] = React.useState(null);
    const [deleteConfirm, setDeleteConfirm] = React.useState({ isOpen: false, noteId: null });
    const [selectedNotes, setSelectedNotes] = React.useState(new Set());

    const { uniqueTags, uniqueConversations } = React.useMemo(() => {
        const tagSet = new Set();
        const conversationSet = new Set();
        notes.forEach(note => {
            if (note.tags) note.tags.forEach(tag => tagSet.add(tag));
            if (note.conversation_id) conversationSet.add(note.conversation_id);
        });
        return {
            uniqueTags: Array.from(tagSet).sort(),
            uniqueConversations: Array.from(conversationSet).sort()
        };
    }, [notes]);

    const handleSaveNote = React.useCallback(async (noteData) => {
        try {
            await NotesAPI.saveNote(noteData);
            await fetchNotes();
            setIsModalOpen(false);
            setSelectedNote(null);
        } catch (error) {
            console.error('Error saving note:', error);
        }
    }, [fetchNotes]);

    const handleDeleteNote = React.useCallback(async (ids) => {
        try {
            const idsArray = Array.isArray(ids) ? ids : [ids];
            await Promise.all(idsArray.map(id => NotesAPI.deleteNote(id)));
            await fetchNotes();
            setDeleteConfirm({ isOpen: false, noteId: null });
            setSelectedNotes(new Set());
        } catch (error) {
            console.error('Error deleting note(s):', error);
        }
    }, [fetchNotes]);

    const handleColorChange = React.useCallback(async (noteId, color) => {
        try {
            await NotesAPI.updateNoteColor(noteId, color);
            await fetchNotes();
        } catch (error) {
            console.error('Error updating note color:', error);
        }
    }, [fetchNotes]);

    const handleEditNote = React.useCallback((note) => {
        setSelectedNote(note);
        setIsModalOpen(true);
    }, []);

    const handleNewNote = React.useCallback(() => {
        setSelectedNote(null);
        setIsModalOpen(true);
    }, []);

    const handleCloseModal = React.useCallback(() => {
        setIsModalOpen(false);
        setSelectedNote(null);
    }, []);

    const handleSelectNote = React.useCallback((noteId) => {
        setSelectedNotes(prev => {
            const next = new Set(prev);
            if (next.has(noteId)) next.delete(noteId);
            else next.add(noteId);
            return next;
        });
    }, []);

    return (
        <ThemeProvider>
            <div className="min-h-screen bg-default flex">
                <Sidebar
                    filters={filters}
                    onUpdateFilters={updateFilters}
                    uniqueTags={uniqueTags}
                    uniqueConversations={uniqueConversations}
                />

                <main className="flex-1 p-4 overflow-auto">
                    <div className="flex justify-end mb-6">
                        <div className="flex gap-2">
                            {selectedNotes.size > 0 && (
                                <button
                                    onClick={() => setDeleteConfirm({
                                        isOpen: true,
                                        noteId: Array.from(selectedNotes),
                                        isBulk: true,
                                        message: `Delete ${selectedNotes.size} selected note(s)?`
                                    })}
                                    className="danger px-4 py-2 rounded hover:bg-danger-hover transition-colors"
                                >
                                    Delete Selected ({selectedNotes.size})
                                </button>
                            )}
                            <button
                                onClick={handleNewNote}
                                className="primary px-4 py-2 rounded hover:bg-accent-hover transition-colors"
                            >
                                New Note
                            </button>
                        </div>
                    </div>

                    {isLoading ? (
                        <div className="flex justify-center items-center h-64">
                            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-accent-primary"></div>
                        </div>
                    ) : error ? (
                        <div className="text-center text-danger mt-8">
                            <p>Error: {error}</p>
                            <button
                                onClick={() => fetchNotes()}
                                className="mt-4 px-4 py-2 rounded bg-accent-primary text-white hover:bg-accent-hover"
                            >
                                Retry
                            </button>
                        </div>
                    ) : (
                        <NotesGrid
                            notes={notes}
                            onEdit={handleEditNote}
                            onDelete={noteId => setDeleteConfirm({ isOpen: true, noteId })}
                            onColorChange={handleColorChange}
                            onTagClick={tag => updateFilters({ selectedTags: [tag], resetPage: true })}
                            onConversationClick={conv => updateFilters({ selectedConversation: conv, resetPage: true })}
                            selectedNotes={selectedNotes}
                            onSelectNote={handleSelectNote}
                        />
                    )}

                    {isModalOpen && (
                        <NoteModal
                            note={selectedNote}
                            onClose={handleCloseModal}
                            onSave={handleSaveNote}
                        />
                    )}

                    <ConfirmDialog
                        isOpen={deleteConfirm.isOpen}
                        message={deleteConfirm.message || "Are you sure you want to delete this note?"}
                        onConfirm={() => handleDeleteNote(deleteConfirm.noteId)}
                        onCancel={() => setDeleteConfirm({ isOpen: false, noteId: null })}
                    />
                </main>
            </div>
        </ThemeProvider>
    );
};

// Render the app
ReactDOM.render(<App />, document.getElementById('root')); 
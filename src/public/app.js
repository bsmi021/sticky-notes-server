// Note component
const Note = ({ note, onEdit, onDelete }) => {
    const noteColors = [
        'bg-yellow-100 border-yellow-200',
        'bg-green-100 border-green-200',
        'bg-blue-100 border-blue-200',
        'bg-pink-100 border-pink-200',
        'bg-purple-100 border-purple-200'
    ];

    const colorIndex = Math.abs(note.id.toString().split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) % noteColors.length;
    const noteColor = noteColors[colorIndex];

    return (
        <div className={`${noteColor} border rounded-lg shadow-md transform transition-all hover:scale-105 cursor-pointer relative p-4`}>
            <div className="flex justify-between items-start mb-2">
                <h3 className="font-bold text-lg flex-grow pr-4">{note.title}</h3>
                <div className="flex space-x-2">
                    <button onClick={() => onEdit(note)} className="text-gray-600 hover:text-blue-500">
                        <i data-lucide="edit" className="w-4 h-4"></i>
                    </button>
                    <button onClick={() => onDelete(note.id)} className="text-gray-600 hover:text-red-500">
                        <i data-lucide="trash" className="w-4 h-4"></i>
                    </button>
                </div>
            </div>

            <p className="text-sm mb-2 line-clamp-3">{note.content}</p>

            <div className="flex flex-wrap gap-1 mt-2">
                {note.tags && note.tags.map(tag => (
                    <span key={tag} className="px-2 py-1 bg-white/50 text-xs rounded-full">
                        {tag}
                    </span>
                ))}
            </div>

            <div className="text-xs text-gray-500 mt-2 flex justify-between">
                <span>{new Date(note.created_at * 1000).toLocaleDateString()}</span>
                <span className="text-gray-400">{note.conversation_id}</span>
            </div>
        </div>
    );
};

// Note Modal component
const NoteModal = ({ note, onClose, onSave }) => {
    const [title, setTitle] = React.useState(note?.title || '');
    const [content, setContent] = React.useState(note?.content || '');
    const [tags, setTags] = React.useState(note?.tags || []);
    const [newTag, setNewTag] = React.useState('');

    const handleSave = () => {
        onSave({
            ...note,
            title,
            content,
            tags,
            conversation_id: note?.conversation_id || 'default'
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-[500px] max-h-[90vh] overflow-y-auto">
                <h2 className="text-xl font-bold mb-4">
                    {note ? 'Edit Note' : 'Create New Note'}
                </h2>

                <input
                    type="text"
                    placeholder="Note Title"
                    className="w-full border rounded p-2 mb-4"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                />

                <textarea
                    placeholder="Note Content"
                    className="w-full border rounded p-2 mb-4 h-40"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                />

                <div className="mb-4">
                    <label className="block mb-2">Tags</label>
                    <div className="flex mb-2">
                        <input
                            type="text"
                            placeholder="Add Tag"
                            className="flex-grow border rounded-l p-2"
                            value={newTag}
                            onChange={(e) => setNewTag(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && addTag()}
                        />
                        <button
                            className="bg-blue-500 text-white px-4 rounded-r"
                            onClick={addTag}
                        >
                            Add
                        </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {tags.map(tag => (
                            <span
                                key={tag}
                                className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full flex items-center"
                            >
                                {tag}
                                <button
                                    className="ml-2"
                                    onClick={() => removeTag(tag)}
                                >
                                    <i data-lucide="x" className="w-4 h-4"></i>
                                </button>
                            </span>
                        ))}
                    </div>
                </div>

                <div className="flex justify-end space-x-2">
                    <button
                        className="bg-gray-200 text-gray-700 px-4 py-2 rounded"
                        onClick={onClose}
                    >
                        Cancel
                    </button>
                    <button
                        className="bg-blue-500 text-white px-4 py-2 rounded"
                        onClick={handleSave}
                    >
                        Save Note
                    </button>
                </div>
            </div>
        </div>
    );
};

// Main App component
const App = () => {
    const [notes, setNotes] = React.useState([]);
    const [pagination, setPagination] = React.useState({});
    const [isModalOpen, setIsModalOpen] = React.useState(false);
    const [selectedNote, setSelectedNote] = React.useState(null);
    const [searchTerm, setSearchTerm] = React.useState('');
    const [selectedTag, setSelectedTag] = React.useState('');

    // Fetch notes on component mount
    React.useEffect(() => {
        fetchNotes();
    }, []);

    const fetchNotes = async () => {
        try {
            const response = await fetch('/api/notes');
            if (!response.ok) throw new Error('Failed to fetch notes');
            const data = await response.json();
            setNotes(data.notes || []);
            setPagination(data.pagination || {});
        } catch (error) {
            console.error('Error fetching notes:', error);
            setNotes([]);
        }
    };

    // Filter notes based on search term and selected tag
    const filteredNotes = React.useMemo(() => {
        return notes.filter(note => {
            const matchesSearch = searchTerm === '' ||
                note.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                note.content.toLowerCase().includes(searchTerm.toLowerCase());

            const matchesTag = selectedTag === '' ||
                (note.tags && note.tags.includes(selectedTag));

            return matchesSearch && matchesTag;
        });
    }, [notes, searchTerm, selectedTag]);

    // Get unique tags safely
    const uniqueTags = React.useMemo(() => {
        return Array.from(new Set(notes.flatMap(note => note.tags || [])));
    }, [notes]);

    const handleSaveNote = async (noteData) => {
        try {
            const url = noteData.id
                ? `/api/notes/${noteData.id}`
                : '/api/notes';

            const method = noteData.id ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(noteData),
            });

            if (!response.ok) throw new Error('Failed to save note');

            await fetchNotes(); // Refresh notes list
            setIsModalOpen(false);
            setSelectedNote(null);
        } catch (error) {
            console.error('Error saving note:', error);
        }
    };

    const handleDeleteNote = async (id) => {
        try {
            const response = await fetch(`/api/notes/${id}`, {
                method: 'DELETE',
            });

            if (!response.ok) throw new Error('Failed to delete note');

            await fetchNotes(); // Refresh notes list
        } catch (error) {
            console.error('Error deleting note:', error);
        }
    };

    return (
        <div className="container mx-auto p-4">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">Sticky Notes</h1>
                <button
                    onClick={() => {
                        setSelectedNote(null);
                        setIsModalOpen(true);
                    }}
                    className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors"
                >
                    New Note
                </button>
            </div>

            <div className="mb-6 flex gap-4">
                <div className="flex-1">
                    <input
                        type="text"
                        placeholder="Search notes..."
                        className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="w-64">
                    <select
                        className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={selectedTag}
                        onChange={(e) => setSelectedTag(e.target.value)}
                    >
                        <option value="">All Tags</option>
                        {uniqueTags.map(tag => (
                            <option key={tag} value={tag}>{tag}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredNotes.map((note) => (
                    <Note
                        key={note.id}
                        note={note}
                        onEdit={(note) => {
                            setSelectedNote(note);
                            setIsModalOpen(true);
                        }}
                        onDelete={handleDeleteNote}
                    />
                ))}
            </div>

            {isModalOpen && (
                <NoteModal
                    note={selectedNote}
                    onClose={() => {
                        setIsModalOpen(false);
                        setSelectedNote(null);
                    }}
                    onSave={handleSaveNote}
                />
            )}

            {filteredNotes.length === 0 && (
                <div className="text-center text-gray-500 mt-8">
                    {searchTerm || selectedTag ?
                        'No notes found matching your search criteria' :
                        'No notes yet. Create your first note!'}
                </div>
            )}
        </div>
    );
};

// Render the app
ReactDOM.render(<App />, document.getElementById('root')); 
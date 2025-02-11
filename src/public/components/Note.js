const Note = React.memo(({ note, onEdit, onDelete, onColorChange, onTagClick, onConversationClick, isSelected, onSelect }) => {
    const noteColors = [
        { hex: '#FFE999', name: 'Yellow' },
        { hex: '#A7F3D0', name: 'Green' },
        { hex: '#93C5FD', name: 'Blue' },
        { hex: '#FCA5A5', name: 'Red' },
        { hex: '#DDD6FE', name: 'Purple' },
        { hex: '#FFB17A', name: 'Orange' }
    ];

    const baseColor = note.color_hex || noteColors[0].hex;
    const headerColor = `${baseColor}40`;
    const bodyColor = `${baseColor}20`;

    return (
        <div className={`note w-full h-[320px] rounded-lg shadow-lg transition-all duration-300 ease-in-out hover:-translate-y-1 hover:shadow-xl relative ${isSelected ? 'ring-2 ring-accent-primary' : ''}`}>
            <div
                className="p-3 border-b cursor-pointer rounded-t-lg flex items-start gap-2"
                style={{ backgroundColor: headerColor, borderColor: baseColor }}
                onClick={() => onEdit(note)}
            >
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

                <NoteHeader
                    title={note.title}
                    noteId={note.id}
                    currentColor={note.color_hex}
                    noteColors={noteColors}
                    onColorChange={onColorChange}
                    onDelete={onDelete}
                />
            </div>

            <NoteContent
                content={note.content}
                tags={note.tags}
                createdAt={note.created_at}
                conversationId={note.conversation_id}
                bodyColor={bodyColor}
                onTagClick={onTagClick}
                onConversationClick={onConversationClick}
            />
        </div>
    );
});

const NoteHeader = React.memo(({ title, noteId, currentColor, noteColors, onColorChange, onDelete }) => (
    <div className="flex justify-between items-start flex-1 min-w-0">
        <h3 className="font-bold text-lg flex-grow pr-4 truncate">{title}</h3>
        <div className="flex space-x-2 flex-shrink-0">
            <ColorPicker
                noteId={noteId}
                currentColor={currentColor}
                colors={noteColors}
                onChange={onColorChange}
            />
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onDelete(noteId);
                }}
                className="text-gray-600 hover:text-red-500 transition-colors flex items-center gap-1"
                title="Delete note"
            >
                <i data-lucide="trash" className="w-4 h-4"></i>
            </button>
        </div>
    </div>
));

const ColorPicker = React.memo(({ noteId, currentColor, colors, onChange }) => (
    <div className="relative group">
        <button
            onClick={(e) => e.stopPropagation()}
            className="text-gray-600 hover:text-blue-500 transition-colors"
            title="Change color"
        >
            <i data-lucide="palette" className="w-4 h-4"></i>
        </button>
        <div className="absolute right-0 mt-2 bg-white rounded-lg shadow-xl p-2 hidden group-hover:flex flex-wrap gap-1 z-10 w-24">
            {colors.map(color => (
                <button
                    key={color.hex}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${currentColor === color.hex ? 'border-blue-500 scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: color.hex }}
                    onClick={(e) => {
                        e.stopPropagation();
                        onChange(noteId, color.hex);
                    }}
                    title={color.name}
                />
            ))}
        </div>
    </div>
));

const NoteContent = React.memo(({ content, tags, createdAt, conversationId, bodyColor, onTagClick, onConversationClick }) => (
    <div
        className="cursor-pointer rounded-b-lg h-[calc(320px-4rem)]"
        style={{ backgroundColor: bodyColor }}
    >
        <div className="h-full overflow-y-auto p-3 flex flex-col">
            <p className="text-sm mb-2 flex-grow">{content}</p>

            <NoteTags tags={tags} onTagClick={onTagClick} />

            <div className="text-xs text-tertiary mt-2 flex justify-between">
                <span>{new Date(createdAt * 1000).toLocaleDateString()}</span>
                <span
                    className="text-tertiary hover:text-accent-primary cursor-pointer"
                    onClick={(e) => {
                        e.stopPropagation();
                        onConversationClick(conversationId);
                    }}
                >
                    {conversationId}
                </span>
            </div>
        </div>
    </div>
));

const NoteTags = React.memo(({ tags, onTagClick }) => (
    <div className="flex flex-wrap gap-1 mt-2">
        {tags && tags.map(tag => (
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
));

window.Note = Note; 
const Sidebar = React.memo(({ filters, onUpdateFilters, uniqueTags, uniqueConversations }) => {
    const handleTagClick = React.useCallback((tag) => {
        onUpdateFilters({
            selectedTags: filters.selectedTags.includes(tag)
                ? filters.selectedTags.filter(t => t !== tag)
                : [...filters.selectedTags, tag],
            resetPage: true
        });
    }, [filters.selectedTags, onUpdateFilters]);

    const handleConversationClick = React.useCallback((conversationId) => {
        onUpdateFilters({
            selectedConversation: filters.selectedConversation === conversationId ? '' : conversationId,
            resetPage: true
        });
    }, [filters.selectedConversation, onUpdateFilters]);

    const resetFilters = React.useCallback(() => {
        onUpdateFilters({
            searchTerm: '',
            selectedTags: [],
            selectedConversation: '',
            resetPage: true
        });
    }, [onUpdateFilters]);

    return (
        <div className="w-64 border-r border-default bg-secondary p-4 flex flex-col h-screen sticky top-0">
            <SidebarHeader onReset={resetFilters} />
            <SearchBar
                value={filters.searchTerm}
                onChange={(value) => onUpdateFilters({ searchTerm: value, resetPage: true })}
            />
            <ConversationsList
                selectedConversation={filters.selectedConversation}
                conversations={uniqueConversations}
                onConversationClick={handleConversationClick}
            />
            <TagsList
                selectedTags={filters.selectedTags}
                tags={uniqueTags}
                onTagClick={handleTagClick}
                onClearTags={() => onUpdateFilters({ selectedTags: [], resetPage: true })}
            />
            <ActiveFilters
                filters={filters}
                onUpdateFilters={onUpdateFilters}
                onReset={resetFilters}
            />
        </div>
    );
});

const SidebarHeader = React.memo(({ onReset }) => (
    <div className="flex items-center justify-between mb-6">
        <h1
            className="text-xl font-bold cursor-pointer hover:text-accent-primary"
            onClick={onReset}
            title="Clear all filters"
        >
            Sticky Notes
        </h1>
        <ThemeToggle />
    </div>
));

const SearchBar = React.memo(({ value, onChange }) => (
    <div className="mb-6">
        <input
            type="text"
            placeholder="Search notes..."
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary bg-secondary border-default"
            value={value}
            onChange={(e) => onChange(e.target.value)}
        />
    </div>
));

const ConversationsList = React.memo(({ selectedConversation, conversations, onConversationClick }) => (
    <div className="mb-6">
        <h2 className="text-sm font-semibold mb-2">Conversations</h2>
        <div className="space-y-1 max-h-48 overflow-y-auto">
            <button
                className={`w-full text-left px-2 py-1.5 rounded text-sm ${!selectedConversation
                    ? 'bg-accent-primary text-white'
                    : 'hover:bg-tertiary'
                    }`}
                onClick={() => onConversationClick('')}
            >
                All Conversations
            </button>
            {conversations.map(conv => (
                <button
                    key={conv.conversationId}
                    className={`w-full text-left px-2 py-1.5 rounded text-sm ${selectedConversation === conv.conversationId
                        ? 'bg-accent-primary text-white'
                        : 'hover:bg-tertiary'
                        }`}
                    onClick={() => onConversationClick(conv.conversationId)}
                >
                    <div className="flex justify-between items-center">
                        <span className="truncate" title={conv.conversationId}>{conv.conversationId}</span>
                        <span className="text-xs opacity-75">{conv.totalNotes}</span>
                    </div>
                    <div className="text-xs opacity-60 mt-0.5">
                        Last updated: {new Date(conv.lastUpdated).toLocaleDateString()}
                    </div>
                </button>
            ))}
        </div>
    </div>
));

const TagsList = React.memo(({ selectedTags, tags, onTagClick, onClearTags }) => (
    <div className="mb-6">
        <h2 className="text-sm font-semibold mb-2">Tags</h2>
        <div className="space-y-1 max-h-48 overflow-y-auto">
            <button
                className={`w-full text-left px-2 py-1.5 rounded text-sm ${selectedTags.length === 0
                    ? 'bg-accent-primary text-white'
                    : 'hover:bg-tertiary'
                    }`}
                onClick={onClearTags}
            >
                All Tags
            </button>
            {tags.map(tag => (
                <button
                    key={tag}
                    className={`w-full text-left px-2 py-1.5 rounded text-sm truncate ${selectedTags.includes(tag)
                        ? 'bg-accent-primary text-white'
                        : 'hover:bg-tertiary'
                        }`}
                    onClick={() => onTagClick(tag)}
                    title={tag}
                >
                    {tag}
                </button>
            ))}
        </div>
    </div>
));

const ActiveFilters = React.memo(({ filters, onUpdateFilters, onReset }) => {
    if (!(filters.selectedTags.length > 0 || filters.selectedConversation || filters.searchTerm)) {
        return null;
    }

    return (
        <div className="mt-auto pt-4 border-t border-default">
            <h2 className="text-sm font-semibold mb-2">Active Filters</h2>
            <div className="space-y-2">
                {filters.searchTerm && (
                    <FilterBadge
                        label={`Search: ${filters.searchTerm}`}
                        onRemove={() => onUpdateFilters({ searchTerm: '', resetPage: true })}
                    />
                )}
                {filters.selectedTags.map(tag => (
                    <FilterBadge
                        key={tag}
                        label={`Tag: ${tag}`}
                        onRemove={() => onUpdateFilters({
                            selectedTags: filters.selectedTags.filter(t => t !== tag),
                            resetPage: true
                        })}
                    />
                ))}
                {filters.selectedConversation && (
                    <FilterBadge
                        label={`Conversation: ${filters.selectedConversation}`}
                        onRemove={() => onUpdateFilters({ selectedConversation: '', resetPage: true })}
                    />
                )}
                <button
                    onClick={onReset}
                    className="w-full px-2 py-1.5 text-sm text-accent-primary hover:text-accent-hover bg-tertiary rounded hover:bg-secondary"
                >
                    Clear All Filters
                </button>
            </div>
        </div>
    );
});

const FilterBadge = React.memo(({ label, onRemove }) => (
    <div className="flex items-center justify-between text-sm bg-tertiary rounded p-2">
        <span className="truncate flex-1 mr-2">{label}</span>
        <button
            onClick={onRemove}
            className="text-primary hover:text-accent-primary flex-shrink-0 p-1 rounded hover:bg-secondary"
            title={`Remove ${label} filter`}
        >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
    </div>
));

window.Sidebar = Sidebar; 
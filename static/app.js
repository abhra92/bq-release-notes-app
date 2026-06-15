// Application State
let updatesState = {
    all: [],
    filtered: [],
    selectedId: null,
    activeCategory: 'all',
    searchQuery: '',
    lastFetched: null
};

// DOM Elements (Lazily evaluated via getters for null-safety)
const elements = {
    get btnRefresh() { return document.getElementById('btn-refresh'); },
    get btnThemeToggle() { return document.getElementById('btn-theme-toggle'); },
    get btnExport() { return document.getElementById('btn-export'); },
    get btnRetry() { return document.getElementById('btn-retry'); },
    get lastUpdated() { return document.getElementById('last-updated'); },
    get searchInput() { return document.getElementById('search-input'); },
    get clearSearch() { return document.getElementById('clear-search'); },
    get filterTabs() { return document.getElementById('filter-tabs'); },
    get updatesFeed() { return document.getElementById('updates-feed'); },
    get loadingSpinner() { return document.getElementById('loading-spinner'); },
    get errorAlert() { return document.getElementById('error-alert'); },
    get errorMessage() { return document.getElementById('error-message'); },
    get emptyState() { return document.getElementById('empty-state'); },
    
    // Detail Pane Elements
    get noSelectionCard() { return document.getElementById('no-selection-card'); },
    get detailCard() { return document.getElementById('detail-card'); },
    get detailBadge() { return document.getElementById('detail-badge'); },
    get detailDate() { return document.getElementById('detail-date'); },
    get detailTitle() { return document.getElementById('detail-title'); },
    get detailBody() { return document.getElementById('detail-body'); },
    get btnTweet() { return document.getElementById('btn-tweet'); },
    get btnDocLink() { return document.getElementById('btn-doc-link'); },
    get btnCopy() { return document.getElementById('btn-copy'); },
    
    // Toast Notification
    get toast() { return document.getElementById('toast'); },
    get toastMessage() { return document.getElementById('toast-message'); },
    get toastIcon() { return document.getElementById('toast-icon'); }
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initEventListeners();
    fetchUpdates(false); // Fetch initially using cache if available
});

// Event Listeners Setup
function initEventListeners() {
    // Refresh button
    if (elements.btnRefresh) elements.btnRefresh.addEventListener('click', () => fetchUpdates(true));
    if (elements.btnRetry) elements.btnRetry.addEventListener('click', () => fetchUpdates(true));
    
    // Export CSV button
    if (elements.btnExport) elements.btnExport.addEventListener('click', exportToCSV);
    
    // Search input
    if (elements.searchInput) elements.searchInput.addEventListener('input', handleSearch);
    if (elements.clearSearch) {
        elements.clearSearch.addEventListener('click', () => {
            if (elements.searchInput) elements.searchInput.value = '';
            handleSearch();
        });
    }
    
    // Category tabs
    if (elements.filterTabs) {
        elements.filterTabs.addEventListener('click', (e) => {
            const tab = e.target.closest('.tab-btn');
            if (!tab) return;
            
            // Remove active class from all tabs
            elements.filterTabs.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            // Add active class to clicked tab
            tab.classList.add('active');
            
            updatesState.activeCategory = tab.dataset.category;
            filterAndRender();
        });
    }
    
    // Detail panel actions
    if (elements.btnTweet) elements.btnTweet.addEventListener('click', tweetSelectedUpdate);
    if (elements.btnCopy) elements.btnCopy.addEventListener('click', copySelectedUpdateText);
}

// Fetch updates from Backend API
async function fetchUpdates(forceRefresh = false) {
    showLoading(true);
    hideError();
    
    // Add spinning animation to refresh icon
    const refreshIcon = elements.btnRefresh.querySelector('i');
    refreshIcon.classList.add('fa-spin');
    
    try {
        const url = `/api/updates${forceRefresh ? '?refresh=true' : ''}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        updatesState.all = data.updates || [];
        updatesState.lastFetched = data.cached_at;
        
        updateTimestampDisplay(data.cached_at);
        filterAndRender();
        
        // Auto-select first item if items exist and nothing is selected yet
        if (updatesState.filtered.length > 0 && !updatesState.selectedId) {
            selectUpdate(updatesState.filtered[0].id);
        } else if (updatesState.selectedId) {
            // Keep current selection if it still exists in the list
            const stillExists = updatesState.all.some(u => u.id === updatesState.selectedId);
            if (!stillExists) {
                clearSelection();
            }
        }
    } catch (error) {
        console.error("Failed to load updates:", error);
        showError(error.message || "Failed to load release notes from the server.");
    } finally {
        showLoading(false);
        refreshIcon.classList.remove('fa-spin');
    }
}

// Formatting Timestamp
function updateTimestampDisplay(epochTime) {
    if (!epochTime) {
        elements.lastUpdated.textContent = 'Last updated: Never';
        return;
    }
    const date = new Date(epochTime * 1000);
    elements.lastUpdated.textContent = `Last updated: ${date.toLocaleTimeString()}`;
}

// Handle Search input change
function handleSearch() {
    const value = elements.searchInput.value.trim().toLowerCase();
    updatesState.searchQuery = value;
    
    // Toggle clear search button visibility
    elements.clearSearch.style.display = value ? 'block' : 'none';
    
    filterAndRender();
}

// Filter state updates and render elements
function filterAndRender() {
    const { all, activeCategory, searchQuery } = updatesState;
    
    // Filter logic
    updatesState.filtered = all.filter(update => {
        // Category Filter
        const matchesCategory = activeCategory === 'all' || update.type === activeCategory;
        
        // Search text Filter
        const matchesSearch = !searchQuery || 
            update.date.toLowerCase().includes(searchQuery) ||
            update.type.toLowerCase().includes(searchQuery) ||
            update.text.toLowerCase().includes(searchQuery);
            
        return matchesCategory && matchesSearch;
    });
    
    renderFeed();
}

// Render dynamic elements to feed
function renderFeed() {
    const { filtered, selectedId } = updatesState;
    elements.updatesFeed.innerHTML = '';
    
    if (filtered.length === 0) {
        elements.emptyState.style.display = 'flex';
        return;
    }
    
    elements.emptyState.style.display = 'none';
    
    filtered.forEach(update => {
        const card = document.createElement('div');
        card.className = `update-card ${selectedId === update.id ? 'selected' : ''}`;
        card.dataset.id = update.id;
        card.dataset.type = update.type;
        
        // Accessibility Attributes (Heuristic Improvement #1)
        card.setAttribute('tabindex', '0');
        card.setAttribute('role', 'button');
        card.setAttribute('aria-label', `${update.type} update from ${update.date}`);
        
        // Determine correct badge class
        let badgeClass = 'badge-default';
        const typeLower = update.type.toLowerCase();
        if (typeLower.includes('feature')) badgeClass = 'badge-feature';
        else if (typeLower.includes('change')) badgeClass = 'badge-changed';
        else if (typeLower.includes('deprecat')) badgeClass = 'badge-deprecation';
        else if (typeLower.includes('breaking')) badgeClass = 'badge-breaking';
        else if (typeLower.includes('note')) badgeClass = 'badge-note';
        
        // Truncate plain text for the feed preview
        let excerpt = update.text;
        if (excerpt.length > 140) {
            excerpt = excerpt.substring(0, 137) + '...';
        }
        
        card.innerHTML = `
            <div class="card-header">
                <div class="card-meta">
                    <span class="badge ${badgeClass}">${update.type}</span>
                    <span class="card-date">${update.date}</span>
                </div>
                <button class="card-copy-btn" title="Copy to clipboard">
                    <i class="fa-regular fa-copy"></i>
                </button>
            </div>
            <div class="card-excerpt">${escapeHtml(excerpt)}</div>
        `;
        
        // Bind copy button click (stop propagation to avoid selecting card)
        const copyBtn = card.querySelector('.card-copy-btn');
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            copyUpdateTextById(update.id);
        });
        
        // Click and Keyboard navigation triggers (Heuristic Improvement #1)
        card.addEventListener('click', () => selectUpdate(update.id));
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault(); // Prevent browser scrolling on Spacebar keypress
                selectUpdate(update.id);
            }
        });
        
        elements.updatesFeed.appendChild(card);
    });
}

// Helper to escape HTML for excerpt presentation
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

// Select an update to show details
function selectUpdate(id) {
    updatesState.selectedId = id;
    
    // Update active highlight classes in feed
    document.querySelectorAll('.update-card').forEach(card => {
        if (card.dataset.id === id) {
            card.classList.add('selected');
        } else {
            card.classList.remove('selected');
        }
    });
    
    // Find the update details
    const update = updatesState.all.find(u => u.id === id);
    if (!update) return;
    
    // Set details in elements
    elements.detailTitle.textContent = `${update.type} Update`;
    elements.detailDate.innerHTML = `<i class="fa-regular fa-calendar"></i> ${update.date}`;
    elements.detailBadge.textContent = update.type;
    
    // Reset and assign badge classes
    elements.detailBadge.className = 'badge'; // Reset
    const typeLower = update.type.toLowerCase();
    if (typeLower.includes('feature')) elements.detailBadge.classList.add('badge-feature');
    else if (typeLower.includes('change')) elements.detailBadge.classList.add('badge-changed');
    else if (typeLower.includes('deprecat')) elements.detailBadge.classList.add('badge-deprecation');
    else if (typeLower.includes('breaking')) elements.detailBadge.classList.add('badge-breaking');
    else if (typeLower.includes('note')) elements.detailBadge.classList.add('badge-note');
    else elements.detailBadge.classList.add('badge-default');
    
    elements.detailBody.innerHTML = update.html;
    elements.btnDocLink.href = update.link;
    
    // Transition Detail View
    elements.noSelectionCard.style.display = 'none';
    elements.detailCard.style.display = 'flex';
    
    // Scroll detail view to top
    elements.detailCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function clearSelection() {
    updatesState.selectedId = null;
    elements.noSelectionCard.style.display = 'flex';
    elements.detailCard.style.display = 'none';
}

// Tweet the selected update
function tweetSelectedUpdate() {
    const update = updatesState.all.find(u => u.id === updatesState.selectedId);
    if (!update) return;
    
    const header = `[BigQuery ${update.type} - ${update.date}]\n\n`;
    const hashtags = `\n\n#BigQuery #GoogleCloud #GCP`;
    const url = update.link;
    
    // Twitter links are shortened to 23 chars. 
    // Calculate safe size: 280 - header_len - link_len(23) - hashtags_len - formatting_spacing(6)
    const urlLengthInTweet = 23;
    const overhead = header.length + hashtags.length + 6 + urlLengthInTweet;
    const maxTextLen = 280 - overhead;
    
    let text = update.text;
    if (text.length > maxTextLen) {
        text = text.substring(0, maxTextLen - 3) + '...';
    }
    
    const tweetText = `${header}${text}\n\nLink: ${url}${hashtags}`;
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
    
    window.open(twitterUrl, '_blank', 'noopener,noreferrer,width=600,height=400');
}

// Copy Selected Update Text to Clipboard
function copySelectedUpdateText() {
    if (!updatesState.selectedId) return;
    copyUpdateTextById(updatesState.selectedId);
}

// Copy a specific update text to clipboard by ID
async function copyUpdateTextById(id) {
    const update = updatesState.all.find(u => u.id === id);
    if (!update) return;
    
    const clipboardText = `[BigQuery ${update.type} - ${update.date}]\n\n${update.text}\n\nLink: ${update.link}`;
    
    try {
        await navigator.clipboard.writeText(clipboardText);
        showToast("Copied to clipboard!", "fa-check", "#10b981");
    } catch (err) {
        console.error("Could not copy text: ", err);
        showToast("Failed to copy text", "fa-xmark", "#ef4444");
    }
}

// Export filtered list of updates to CSV
function exportToCSV() {
    const { filtered, activeCategory, searchQuery } = updatesState;
    if (filtered.length === 0) {
        showToast("No updates to export", "fa-circle-exclamation", "#ef4444");
        return;
    }
    
    // CSV column escape utility
    const escapeCsv = (text) => {
        if (text === null || text === undefined) return '';
        const stringified = String(text);
        return `"${stringified.replace(/"/g, '""')}"`;
    };
    
    // Header
    let csvContent = "Date,Type,Text,Link\n";
    
    filtered.forEach(update => {
        const row = [
            escapeCsv(update.date),
            escapeCsv(update.type),
            escapeCsv(update.text),
            escapeCsv(update.link)
        ].join(",");
        
        csvContent += row + "\n";
    });
    
    // Create Blob with BOM (\uFEFF) to guarantee proper UTF-8 parsing in Excel
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    
    let filename = "bigquery_release_notes";
    if (activeCategory !== 'all') {
        filename += `_${activeCategory.toLowerCase()}`;
    }
    if (searchQuery) {
        const sanitizedQuery = searchQuery.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        filename += `_search_${sanitizedQuery}`;
    }
    filename += ".csv";
    
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up memory
    setTimeout(() => {
        URL.revokeObjectURL(url);
    }, 100);
    
    showToast(`Exported ${filtered.length} updates!`, "fa-file-excel", "#10b981");
}

// Dark/Light Theme Initialization (Safe from localStorage access blockages)
function initTheme() {
    let savedTheme = 'dark';
    try {
        savedTheme = localStorage.getItem('theme') || 'dark';
    } catch (e) {
        console.warn("localStorage is blocked or unavailable, defaulting to dark theme:", e);
    }
    
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
        updateThemeIcon('light');
    } else {
        document.body.classList.remove('light-theme');
        updateThemeIcon('dark');
    }
    
    if (elements.btnThemeToggle) {
        elements.btnThemeToggle.addEventListener('click', () => {
            const isLight = document.body.classList.toggle('light-theme');
            const newTheme = isLight ? 'light' : 'dark';
            try {
                localStorage.setItem('theme', newTheme);
            } catch (e) {
                console.warn("localStorage is blocked or unavailable:", e);
            }
            updateThemeIcon(newTheme);
        });
    }
}

// Update Theme Toggle Button Icon
function updateThemeIcon(theme) {
    if (!elements.btnThemeToggle) return;
    const themeIcon = elements.btnThemeToggle.querySelector('i');
    if (!themeIcon) return;
    
    if (theme === 'light') {
        themeIcon.className = 'fa-solid fa-sun';
    } else {
        themeIcon.className = 'fa-solid fa-moon';
    }
}

// Show Toast Notification
function showToast(message, iconClass, color) {
    elements.toastMessage.textContent = message;
    elements.toastIcon.className = `fa-solid ${iconClass}`;
    elements.toast.style.backgroundColor = color;
    
    // Glow shadow depending on the color type
    elements.toast.style.boxShadow = `0 10px 25px ${color}4d`; // 4d is 30% alpha in hex
    
    elements.toast.classList.add('show');
    
    setTimeout(() => {
        elements.toast.classList.remove('show');
    }, 3000);
}

// UI Helpers
function showLoading(isLoading) {
    elements.loadingSpinner.style.display = isLoading ? 'flex' : 'none';
}

function showError(msg) {
    elements.errorMessage.textContent = msg;
    elements.errorAlert.style.display = 'flex';
}

function hideError() {
    elements.errorAlert.style.display = 'none';
}

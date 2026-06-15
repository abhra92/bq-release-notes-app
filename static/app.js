// Application State
let updatesState = {
    all: [],
    filtered: [],
    selectedId: null,
    activeCategory: 'all',
    searchQuery: '',
    lastFetched: null
};

// DOM Elements
const elements = {
    btnRefresh: document.getElementById('btn-refresh'),
    btnRetry: document.getElementById('btn-retry'),
    lastUpdated: document.getElementById('last-updated'),
    searchInput: document.getElementById('search-input'),
    clearSearch: document.getElementById('clear-search'),
    filterTabs: document.getElementById('filter-tabs'),
    updatesFeed: document.getElementById('updates-feed'),
    loadingSpinner: document.getElementById('loading-spinner'),
    errorAlert: document.getElementById('error-alert'),
    errorMessage: document.getElementById('error-message'),
    emptyState: document.getElementById('empty-state'),
    
    // Detail Pane Elements
    noSelectionCard: document.getElementById('no-selection-card'),
    detailCard: document.getElementById('detail-card'),
    detailBadge: document.getElementById('detail-badge'),
    detailDate: document.getElementById('detail-date'),
    detailTitle: document.getElementById('detail-title'),
    detailBody: document.getElementById('detail-body'),
    btnTweet: document.getElementById('btn-tweet'),
    btnDocLink: document.getElementById('btn-doc-link'),
    btnCopy: document.getElementById('btn-copy'),
    
    // Toast Notification
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toast-message'),
    toastIcon: document.getElementById('toast-icon')
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    fetchUpdates(false); // Fetch initially using cache if available
});

// Event Listeners Setup
function initEventListeners() {
    // Refresh button
    elements.btnRefresh.addEventListener('click', () => fetchUpdates(true));
    elements.btnRetry.addEventListener('click', () => fetchUpdates(true));
    
    // Search input
    elements.searchInput.addEventListener('input', handleSearch);
    elements.clearSearch.addEventListener('click', () => {
        elements.searchInput.value = '';
        handleSearch();
    });
    
    // Category tabs
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
    
    // Detail panel actions
    elements.btnTweet.addEventListener('click', tweetSelectedUpdate);
    elements.btnCopy.addEventListener('click', copySelectedUpdateText);
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
            </div>
            <div class="card-excerpt">${escapeHtml(excerpt)}</div>
        `;
        
        card.addEventListener('click', () => selectUpdate(update.id));
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
async function copySelectedUpdateText() {
    const update = updatesState.all.find(u => u.id === updatesState.selectedId);
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

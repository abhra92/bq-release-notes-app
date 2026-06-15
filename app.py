import os
import time
import logging
import hashlib
import xml.etree.ElementTree as ET
import requests
from bs4 import BeautifulSoup
from flask import Flask, jsonify, render_template, request

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)

FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"

# In-memory cache for parsed updates
cache = {
    "data": None,
    "last_fetched": 0,
    "ttl": 600  # 10 minutes cache TTL
}

def normalize_type(update_type):
    """Normalize update type for UI badge styling."""
    t = update_type.strip().lower()
    if 'feature' in t:
        return 'Feature'
    elif 'deprecat' in t:
        return 'Deprecation'
    elif 'breaking' in t:
        return 'Breaking Change'
    elif 'chang' in t:
        return 'Changed'
    elif 'note' in t:
        return 'Note'
    return update_type.strip().capitalize()

def parse_updates_from_html(content_html, entry_date, entry_id, entry_link):
    """
    Parse HTML content of a feed entry and split it into individual updates.
    Returns a list of update dicts.
    """
    soup = BeautifulSoup(content_html, 'html.parser')
    updates = []
    
    # BigQuery release notes feed typically contains updates separated by h3 tags
    # e.g., <h3>Feature</h3> <p>...</p> <h3>Feature</h3> <p>...</p>
    headers = soup.find_all('h3')
    
    if not headers:
        # If there are no h3 tags, treat the entire content as one update
        text_content = soup.get_text().strip()
        # Create a simple hash-based suffix for ID uniqueness
        hash_suffix = hashlib.md5(content_html.encode('utf-8')).hexdigest()[:6]
        updates.append({
            'id': f"{entry_id}_{hash_suffix}",
            'date': entry_date,
            'type': 'Update',
            'html': content_html,
            'text': text_content,
            'link': entry_link
        })
        return updates
        
    for index, header in enumerate(headers):
        update_type = normalize_type(header.get_text())
        
        # Collect all sibling elements after this header until the next h3 header
        sibling_html = []
        sibling_text = []
        curr = header.next_sibling
        
        while curr and curr.name != 'h3':
            if curr.name:  # It's an HTML element
                sibling_html.append(str(curr))
                sibling_text.append(curr.get_text())
            elif isinstance(curr, str) and curr.strip():  # Text node
                sibling_html.append(curr)
                sibling_text.append(curr.strip())
            curr = curr.next_sibling
            
        html_content = "".join(sibling_html).strip()
        text_content = " ".join(sibling_text).strip()
        
        # Fallback to header text if content is empty
        if not html_content:
            html_content = f"<p>Details for this {update_type.lower()} update can be found in the release notes.</p>"
            text_content = f"Details for this {update_type.lower()} update can be found in the release notes."
            
        updates.append({
            'id': f"{entry_id}_{index}",
            'date': entry_date,
            'type': update_type,
            'html': html_content,
            'text': text_content,
            'link': entry_link
        })
        
    return updates

def fetch_and_parse_feed():
    """Fetch the BigQuery release notes Atom feed and parse it."""
    logger.info(f"Fetching release notes from {FEED_URL}...")
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    response = requests.get(FEED_URL, headers=headers, timeout=15)
    response.raise_for_status()
    
    # Parse XML
    root = ET.fromstring(response.content)
    
    # Atom namespace
    ns = {'atom': 'http://www.w3.org/2005/Atom'}
    
    all_updates = []
    
    for entry in root.findall('atom:entry', ns):
        title_elem = entry.find('atom:title', ns)
        entry_date = title_elem.text.strip() if title_elem is not None else "Unknown Date"
        
        id_elem = entry.find('atom:id', ns)
        entry_id = id_elem.text.strip() if id_elem is not None else str(hash(entry_date))
        
        link_elem = entry.find('atom:link[@rel="alternate"]', ns)
        if link_elem is None:
            link_elem = entry.find('atom:link', ns)
        entry_link = link_elem.attrib['href'].strip() if link_elem is not None else "https://cloud.google.com/bigquery/docs/release-notes"
        
        content_elem = entry.find('atom:content', ns)
        content_html = content_elem.text if content_elem is not None else ""
        
        if content_html:
            entry_updates = parse_updates_from_html(content_html, entry_date, entry_id, entry_link)
            all_updates.extend(entry_updates)
            
    logger.info(f"Successfully parsed {len(all_updates)} individual updates.")
    return all_updates

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/updates')
def get_updates():
    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    current_time = time.time()
    
    # If cache is valid and refresh not forced, return cached data
    if cache["data"] and not force_refresh and (current_time - cache["last_fetched"] < cache["ttl"]):
        logger.info("Serving release notes from cache.")
        return jsonify({
            "updates": cache["data"],
            "cached_at": cache["last_fetched"],
            "source": "cache"
        })
        
    try:
        updates = fetch_and_parse_feed()
        cache["data"] = updates
        cache["last_fetched"] = current_time
        return jsonify({
            "updates": updates,
            "cached_at": current_time,
            "source": "network"
        })
    except Exception as e:
        logger.exception("Error fetching or parsing release notes:")
        
        # If we have cached data, fall back to it even if it's expired
        if cache["data"]:
            logger.warning("Network request failed. Falling back to expired cache.")
            return jsonify({
                "updates": cache["data"],
                "cached_at": cache["last_fetched"],
                "source": "expired_cache_fallback",
                "error": str(e)
            })
            
        return jsonify({
            "error": "Failed to fetch BigQuery release notes. Please check your internet connection or try again later.",
            "details": str(e)
        }), 500

if __name__ == '__main__':
    # Bind to all interfaces to allow access if needed
    app.run(debug=True, host='127.0.0.1', port=5000)

/**
 * Metro map rendering logic - Grid-based layout
 */

const MetroMap = (() => {
    let stationsData = null;
    let imageCache = {};

    const init = (data) => {
        stationsData = data;
        preloadImages();
    };

    /**
     * Preload all images to check if they exist
     */
    const preloadImages = () => {
        if (!stationsData) return;

        stationsData.stations.forEach(station => {
            station.targets.forEach(target => {
                if (target.image) {
                    const img = new Image();
                    img.onload = () => {
                        imageCache[target.image] = true;
                    };
                    img.onerror = () => {
                        imageCache[target.image] = false;
                    };
                    img.src = target.image;
                }
            });
        });
    };

    /**
     * Check if an image exists
     */
    const hasImage = (imagePath) => {
        return imageCache[imagePath] === true;
    };

    /**
     * Get line color
     */
    const getLineColor = (line) => {
        if (!stationsData || !stationsData.lineColors) return '#999';
        return stationsData.lineColors[line] || '#999';
    };

    /**
     * Format date for display
     */
    const formatDate = (dateString) => {
        if (!dateString) return 'not yet';
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        } catch {
            return dateString;
        }
    };

    /**
     * Create a station tile element for the grid
     */
    const createStationTile = (station, line, target) => {
        const tile = document.createElement('div');
        tile.className = 'station-tile';
        tile.setAttribute('role', 'button');
        tile.setAttribute('tabindex', '0');
        
        // Line color for the border
        const lineColor = getLineColor(line);
        tile.style.borderColor = lineColor;

        // Image section
        const imageContainer = document.createElement('div');
        imageContainer.className = 'station-tile-image';

        const imageExists = hasImage(target.image);
        const isComplete = ProgressTracker.isTargetComplete(station.targets, line);

        if (imageExists && isComplete) {
            const img = document.createElement('img');
            img.src = target.image;
            img.alt = `${station.name} - Line ${line}`;
            imageContainer.appendChild(img);
            
            tile.setAttribute('aria-label', `${station.name} - Line ${line}, photographed ${formatDate(target.datePhotographed)}`);
            tile.addEventListener('click', () => showLightbox(station, line, target));
            tile.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    showLightbox(station, line, target);
                }
            });
        } else {
            const placeholder = document.createElement('div');
            placeholder.className = 'station-tile-placeholder';
            placeholder.innerHTML = `
                <div class="station-tile-placeholder-icon">📷</div>
                <div>Not photographed yet</div>
            `;
            imageContainer.appendChild(placeholder);
            tile.setAttribute('aria-label', `${station.name} - Line ${line}, not photographed`);
        }

        tile.appendChild(imageContainer);

        // Info section
        const info = document.createElement('div');
        info.className = 'station-tile-info';
        
        const nameEl = document.createElement('div');
        nameEl.className = 'station-tile-name';
        nameEl.textContent = station.name;
        info.appendChild(nameEl);

        const lineEl = document.createElement('div');
        lineEl.className = 'station-tile-lines';
        lineEl.textContent = `Line ${line}`;
        lineEl.style.color = lineColor;
        lineEl.style.fontWeight = '600';
        info.appendChild(lineEl);

        tile.appendChild(info);

        return tile;
    };

    /**
     * Render all stations as a grid, ordered by line
     */
    const renderStations = () => {
        const grid = document.getElementById('station-grid');
        grid.innerHTML = '';

        if (!stationsData) return;

        // Group stations by line and render in order
        const lines = ['A', 'B', 'C'];
        
        lines.forEach(line => {
            // Get all stations on this line in order
            const stationsOnLine = stationsData.stations.filter(s => s.lines.includes(line));
            
            stationsOnLine.forEach(station => {
                // Find the target for this specific line
                const target = station.targets.find(t => t.line === line);
                if (target) {
                    const tile = createStationTile(station, line, target);
                    grid.appendChild(tile);
                }
            });
        });
    };

    /**
     * Show the lightbox with the selected photo
     */
    const showLightbox = (station, line, target) => {
        const lightbox = document.getElementById('lightbox');
        const image = document.getElementById('lightbox-image');
        const title = document.getElementById('lightbox-title');
        const date = document.getElementById('lightbox-date');

        image.src = target.image;
        image.alt = `${station.name} - Line ${line}`;

        const lineNames = station.lines.join(' / ');
        title.textContent = `${station.name} — Line ${line}`;

        const formattedDate = formatDate(target.datePhotographed);
        date.textContent = `Photographed ${formattedDate}`;

        lightbox.classList.remove('hidden');
    };

    /**
     * Main render function
     */
    const render = () => {
        renderStations();
    };

    return {
        init,
        render,
        showLightbox
    };
})();

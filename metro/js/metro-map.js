/**
 * Metro map rendering logic
 * Grid-based layout
 *
 * Images are loaded directly by the browser rather than being
 * preloaded into a separate cache. This avoids async rendering
 * race conditions.
 */

const MetroMap = (() => {
    let stationsData = null;

    /**
     * Initialise the metro map.
     */
    const init = (data) => {
        if (!data || !Array.isArray(data.stations)) {
            console.error('MetroMap: Invalid station data.', data);
            return;
        }

        stationsData = data;
    };

    /**
     * Get the colour for a line.
     */
    const getLineColor = (line) => {
        if (!stationsData?.lineColors) {
            return '#999';
        }

        return stationsData.lineColors[line] || '#999';
    };

    /**
     * Format a date for display.
     */
    const formatDate = (dateString) => {
        if (!dateString) {
            return 'not yet';
        }

        const date = new Date(dateString);

        if (Number.isNaN(date.getTime())) {
            return dateString;
        }

        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    /**
     * Create a placeholder for a missing/unavailable image.
     */
    const createPlaceholder = (text = 'Not photographed yet') => {
        const placeholder = document.createElement('div');
        placeholder.className = 'station-tile-placeholder';

        const icon = document.createElement('div');
        icon.className = 'station-tile-placeholder-icon';
        icon.textContent = '📷';

        const message = document.createElement('div');
        message.textContent = text;

        placeholder.appendChild(icon);
        placeholder.appendChild(message);

        return placeholder;
    };

    /**
     * Add the station tile's keyboard/click behaviour.
     */
    const makeTileInteractive = (tile, station, line, target) => {
        tile.setAttribute(
            'aria-label',
            `${station.name} - Line ${line}, photographed ${formatDate(target.datePhotographed)}`
        );

        tile.addEventListener('click', () => {
            showLightbox(station, line, target);
        });

        tile.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                showLightbox(station, line, target);
            }
        });
    };

    /**
     * Create the image section of a station tile.
     */
    const createImageSection = (station, line, target, isComplete, tile) => {
        const imageContainer = document.createElement('div');
        imageContainer.className = 'station-tile-image';

        /*
         * No image URL.
         */
        if (!target?.image) {
            imageContainer.appendChild(
                createPlaceholder('Not photographed yet')
            );

            tile.setAttribute(
                'aria-label',
                `${station.name} - Line ${line}, not photographed`
            );

            return imageContainer;
        }

        /*
         * Target isn't complete yet.
         */
        if (!isComplete) {
            imageContainer.appendChild(
                createPlaceholder('Not photographed yet')
            );

            tile.setAttribute(
                'aria-label',
                `${station.name} - Line ${line}, not photographed`
            );

            return imageContainer;
        }

        /*
         * We have an image and the target is complete.
         *
         * The browser handles loading the image directly.
         * This avoids the old preloadImages()/imageCache race.
         */
        const img = document.createElement('img');

        img.src = target.image;
        img.alt = `${station.name} - Line ${line}`;
        img.loading = 'lazy';
        img.decoding = 'async';

        /*
         * If the image loads successfully, keep it.
         */
        img.addEventListener('load', () => {
            console.log(
                `MetroMap: Image loaded successfully for ${station.name} (${line})`,
                target.image
            );

            imageContainer.classList.add('image-loaded');
        });

        /*
         * If the image fails, replace it with a useful placeholder.
         */
        img.addEventListener('error', () => {
            console.error(
                `MetroMap: Failed to load image for ${station.name} (${line}):`,
                target.image
            );

            imageContainer.innerHTML = '';

            imageContainer.appendChild(
                createPlaceholder('Image unavailable')
            );

            tile.classList.add('image-error');

            tile.setAttribute(
                'aria-label',
                `${station.name} - Line ${line}, image unavailable`
            );
        });

        imageContainer.appendChild(img);

        makeTileInteractive(tile, station, line, target);

        return imageContainer;
    };

    /**
     * Create a station tile.
     */
    const createStationTile = (station, line, target) => {
        const tile = document.createElement('div');

        tile.className = 'station-tile';

        tile.setAttribute('role', 'button');
        tile.setAttribute('tabindex', '0');

        /*
         * Line colour.
         */
        const lineColor = getLineColor(line);

        tile.style.borderColor = lineColor;

        /*
         * Check whether this target is complete.
         *
         * Keep this isolated so it's easy to debug if the
         * ProgressTracker is responsible for hiding images.
         */
        let isComplete = false;

        try {
            if (
                typeof ProgressTracker !== 'undefined' &&
                typeof ProgressTracker.isTargetComplete === 'function'
            ) {
                isComplete = ProgressTracker.isTargetComplete(
                    station.targets,
                    line
                );
            } else {
                console.warn(
                    'MetroMap: ProgressTracker.isTargetComplete() is unavailable.'
                );
            }
        } catch (error) {
            console.error(
                'MetroMap: Error checking target completion:',
                error
            );
        }

        /*
         * Debug information.
         */
        console.log('MetroMap tile:', {
            station: station.name,
            line,
            image: target?.image,
            isComplete
        });

        /*
         * Image section.
         */
        const imageContainer = createImageSection(
            station,
            line,
            target,
            isComplete,
            tile
        );

        tile.appendChild(imageContainer);

        /*
         * Information section.
         */
        const info = document.createElement('div');
        info.className = 'station-tile-info';

        /*
         * Station name.
         */
        const nameEl = document.createElement('div');
        nameEl.className = 'station-tile-name';
        nameEl.textContent = station.name;

        info.appendChild(nameEl);

        /*
         * Line name.
         */
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
     * Render all stations into the grid.
     *
     * Stations are grouped in A/B/C line order.
     */
    const renderStations = () => {
        const grid = document.getElementById('station-grid');

        if (!grid) {
            console.error(
                'MetroMap: Could not find #station-grid in the document.'
            );
            return;
        }

        /*
         * Clear the existing grid.
         */
        grid.innerHTML = '';

        if (!stationsData) {
            console.warn('MetroMap: No station data available.');
            return;
        }

        const lines = ['A', 'B', 'C'];

        lines.forEach((line) => {
            const stationsOnLine = stationsData.stations.filter((station) => {
                return Array.isArray(station.lines) &&
                    station.lines.includes(line);
            });

            stationsOnLine.forEach((station) => {
                /*
                 * Find the target belonging to this line.
                 */
                const target = Array.isArray(station.targets)
                    ? station.targets.find(
                        (item) => item.line === line
                    )
                    : null;

                if (!target) {
                    console.warn(
                        `MetroMap: No target found for ${station.name} on Line ${line}`
                    );
                    return;
                }

                const tile = createStationTile(
                    station,
                    line,
                    target
                );

                grid.appendChild(tile);
            });
        });
    };

    /**
     * Show the lightbox for a station image.
     */
    const showLightbox = (station, line, target) => {
        const lightbox = document.getElementById('lightbox');
        const image = document.getElementById('lightbox-image');
        const title = document.getElementById('lightbox-title');
        const date = document.getElementById('lightbox-date');

        if (!lightbox) {
            console.error('MetroMap: #lightbox not found.');
            return;
        }

        if (!image) {
            console.error('MetroMap: #lightbox-image not found.');
            return;
        }

        if (!title) {
            console.error('MetroMap: #lightbox-title not found.');
            return;
        }

        if (!date) {
            console.error('MetroMap: #lightbox-date not found.');
            return;
        }

        /*
         * Don't open the lightbox if there isn't an image.
         */
        if (!target?.image) {
            console.warn(
                'MetroMap: Cannot open lightbox because target has no image.'
            );
            return;
        }

        image.src = target.image;
        image.alt = `${station.name} - Line ${line}`;

        title.textContent = `${station.name} — Line ${line}`;

        date.textContent =
            `Photographed ${formatDate(target.datePhotographed)}`;

        /*
         * Show the lightbox.
         */
        lightbox.classList.remove('hidden');
    };

    /**
     * Close the lightbox.
     */
    const closeLightbox = () => {
        const lightbox = document.getElementById('lightbox');

        if (!lightbox) {
            return;
        }

        lightbox.classList.add('hidden');
    };

    /**
     * Set up lightbox close controls.
     */
    const initLightbox = () => {
        const lightbox = document.getElementById('lightbox');

        if (!lightbox) {
            return;
        }

        /*
         * Close buttons.
         */
        const closeButtons = lightbox.querySelectorAll(
            '[data-lightbox-close], .lightbox-close'
        );

        closeButtons.forEach((button) => {
            button.addEventListener('click', closeLightbox);
        });

        /*
         * Clicking the background closes the lightbox.
         */
        lightbox.addEventListener('click', (event) => {
            if (event.target === lightbox) {
                closeLightbox();
            }
        });

        /*
         * Escape closes the lightbox.
         */
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closeLightbox();
            }
        });
    };

    /**
     * Main render function.
     */
    const render = () => {
        renderStations();
    };

    /*
     * Public API.
     */
    return {
        init,
        render,
        showLightbox,
        closeLightbox,
        initLightbox
    };
})();
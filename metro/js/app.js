/**
 * Main application logic
 */

const App = (() => {
    const BASE_PATH = getBasePath();

    /**
     * Get the base path for this website (for GitLab Pages compatibility)
     */
    function getBasePath() {
        const path = window.location.pathname;
        // Check if we're on GitLab Pages (path includes project name)
        if (path.includes('/metro')) {
            return '/metro';
        }
        return '';
    }

    /**
     * Load station data
     */
    const loadStationsData = async () => {
        try {
            const response = await fetch(`${BASE_PATH}/data/stations.json`);
            if (!response.ok) {
                throw new Error(`Failed to load stations data: ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error loading stations data:', error);
            return null;
        }
    };

    /**
     * Initialize the application
     */
    const init = async () => {
        console.log('Initializing Prague Metro Photos application...');

        // Load data
        const stationsData = await loadStationsData();
        if (!stationsData) {
            console.error('Failed to load stations data');
            document.body.innerHTML = '<div style="padding: 20px; text-align: center;"><h2>Error loading application</h2><p>Could not load station data.</p></div>';
            return;
        }

        // Initialize modules
        ProgressTracker.init(stationsData);
        MetroMap.init(stationsData);

        // Render the map
        MetroMap.render();

        // Update progress display
        ProgressTracker.updateDisplay();

        // Setup event listeners
        setupEventListeners();

        console.log('Application initialized successfully');
    };

    /**
     * Setup event listeners
     */
    const setupEventListeners = () => {
        // Lightbox overlay click to close
        const lightboxOverlay = document.getElementById('lightbox-overlay');
        lightboxOverlay.addEventListener('click', closeLightbox);

        // Lightbox close button
        const closeBtn = document.getElementById('lightbox-close');
        closeBtn.addEventListener('click', closeLightbox);

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeLightbox();
            }
        });

        // Prevent scrolling when lightbox is open
        const lightbox = document.getElementById('lightbox');
        const observer = new MutationObserver(() => {
            if (!lightbox.classList.contains('hidden')) {
                document.body.style.overflow = 'hidden';
            } else {
                document.body.style.overflow = '';
            }
        });

        observer.observe(lightbox, { attributes: true, attributeFilter: ['class'] });
    };

    /**
     * Close the lightbox
     */
    const closeLightbox = () => {
        const lightbox = document.getElementById('lightbox');
        lightbox.classList.add('hidden');
        document.body.style.overflow = '';
    };

    return {
        init
    };
})();

// Start the application when the page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        App.init();
    });
} else {
    App.init();
}

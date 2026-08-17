# Prague Metro Photos

A responsive website documenting a personal project of photographing every station of the Prague Metro network.

## Overview

**Prague Metro Photos** is a static website that displays the Prague Metro network as an interactive map. Each station is represented by a square photograph (or a placeholder until photographed). The site shows real-time progress as you photograph stations across all three lines (A, B, and C).

The website is designed to work as a static GitLab Pages site—no backend or build process required. Just add photographs to the repository and update the station data, and the site automatically reflects your progress.

## Features

- **Visual Metro Map**: An SVG-based recreation of the Prague Metro network layout with proper line colours and topology
- **Square Photo Tiles**: Each station displays a square photograph or a placeholder
- **Progress Tracking**: Overall progress and per-line progress with visual progress bars
- **Interchange Stations**: Special handling for stations where multiple Metro lines meet (Můstek, Florenc, Muzeum, Hlavní nádraží)
- **Interactive Lightbox**: Click on any completed photograph to view it enlarged with metadata
- **Fully Responsive**: Works on desktop, tablet, and mobile devices
- **Keyboard Accessible**: Full keyboard navigation and screen reader support

## Project Structure

```
metro/
├── index.html                 # Main page
├── css/
│   └── styles.css            # All styling
├── js/
│   ├── app.js                # Main application logic
│   ├── progress.js           # Progress calculation
│   └── metro-map.js          # SVG map rendering
├── data/
│   └── stations.json         # Station and metadata database
└── images/
    ├── A/                    # Line A photographs
    ├── B/                    # Line B photographs
    └── C/                    # Line C photographs
```

## Station Data Format

All station information is stored in `data/stations.json`. Each station record contains:

```json
{
  "id": "s010",
  "name": "Můstek",
  "lines": ["A", "B"],
  "interchange": true,
  "targets": [
    {
      "line": "A",
      "image": "/images/A/mustek-a.jpg",
      "datePhotographed": "2026-08-17"
    },
    {
      "line": "B",
      "image": "/images/B/mustek-b.jpg",
      "datePhotographed": null
    }
  ],
  "position": {"x": 10, "y": 11}
}
```

### Field Definitions

- **id**: Unique identifier for the station (e.g., "s010")
- **name**: Official station name (e.g., "Můstek")
- **lines**: Array of Metro line(s) serving this station (["A"], ["A", "B"], etc.)
- **interchange**: Boolean indicating if this is an interchange station
- **targets**: Array of photograph targets (one per line at this station)
  - **line**: Which Metro line this target represents
  - **image**: Path to the photograph file (relative to website root)
  - **datePhotographed**: Date the photograph was taken (ISO format: "YYYY-MM-DD") or `null` if not yet photographed
- **position**: Coordinates for placing the station on the map (`{x, y}`)

## How to Add a Photograph

Follow these steps when you photograph a new station:

### 1. Take Your Photograph

Photograph the station. The website expects square images, so crop or compose your photo appropriately.

### 2. Save and Commit the Image

Save the photograph with a clear, consistent filename:

- **Line A**: `images/A/{station-name-lowercase}.jpg`
- **Line B**: `images/B/{station-name-lowercase}.jpg`
- **Line C**: `images/C/{station-name-lowercase}.jpg`

For interchange stations, use the format:
- `images/A/mustek-a.jpg`
- `images/B/mustek-b.jpg`

Example:
```bash
# Photograph of Dejvická station on Line A
images/A/dejvicka.jpg

# Photographs of Můstek interchange
images/A/mustek-a.jpg
images/B/mustek-b.jpg
```

### 3. Update Station Data

Update `data/stations.json` to record the photograph date. Find the station entry and update the relevant target:

**Before** (not photographed):
```json
{
  "name": "Dejvická",
  "lines": ["A"],
  "targets": [
    {
      "line": "A",
      "image": "/images/A/dejvicka.jpg",
      "datePhotographed": null
    }
  ]
}
```

**After** (photographed):
```json
{
  "name": "Dejvická",
  "lines": ["A"],
  "targets": [
    {
      "line": "A",
      "image": "/images/A/dejvicka.jpg",
      "datePhotographed": "2026-08-17"
    }
  ]
}
```

### 4. Commit and Push

```bash
git add images/A/dejvicka.jpg data/stations.json
git commit -m "Add Dejvická station photo"
git push origin main
```

The website will automatically update to show the new photograph and updated progress.

## How Interchange Stations Work

Interchange stations require photographs from each Metro line represented at that station. For example:

**Můstek** (Line A & B):
- Must have both `mustek-a.jpg` and `mustek-b.jpg` photographed to be considered complete
- Progress shows as incomplete until both photographs exist and both have dates recorded

**Florenc** (Line B & C):
- Must have both `florenc-b.jpg` and `florenc-c.jpg` photographed to be considered complete

**Muzeum** (Line A & C):
- Must have both `muzeum-a.jpg` and `muzeum-c.jpg` photographed to be considered complete

This applies even if you photograph Florenc's Line B platform one day and Line C platform weeks later—both targets must be complete for Florenc to count toward overall progress.

## Progress Calculation

### Overall Progress
- **Completed**: Count of stations with all required photographs
- **Total**: 61 (current Prague Metro station count)
- **Percentage**: (Completed / Total) × 100

### Per-Line Progress
- **Line A**: Stations with at least one Line A platform photographed (17 total)
- **Line B**: Stations with at least one Line B platform photographed (24 total)
- **Line C**: Stations with at least one Line C platform photographed (20 total)

Note: Interchange stations count toward a line's progress only when all their required line platforms are photographed.

## How to Update Station Data

If the Prague Metro network changes (new stations, line realignment, name changes):

### Add a New Station

1. Add a new entry to the `stations` array in `data/stations.json`
2. Assign it a unique `id`
3. Add it to the correct `lines` array
4. Provide approximate `position` coordinates
5. Create the appropriate `targets` array entries
6. Create image directories if needed

### Remove a Station

Delete the station entry from `data/stations.json`.

### Rename a Station

Update the `name` field in the station entry and update any photograph filenames if desired (also update the `image` paths in the JSON).

### Update Map Positions

The `position` object determines where a station appears on the map. Adjust `x` and `y` values to reposition stations. The map uses a simple coordinate system—increase values to move right or down.

## Running Locally

### Prerequisites

- A web browser
- No build tools or local server required, but a local server is recommended for development

### Option 1: Simple HTTP Server (Python)

```bash
cd metro
python3 -m http.server 8000
# Visit http://localhost:8000
```

### Option 2: Node.js HTTP Server

```bash
cd metro
npx http-server
# Visit http://localhost:8080
```

### Option 3: VS Code Live Server

Install the Live Server extension in VS Code, then right-click `index.html` and select "Open with Live Server".

## Deployment to GitLab Pages

### Prerequisites

- A GitLab account
- This project pushed to a GitLab repository

### Setup

1. **Ensure `.gitlab-ci.yml` exists** at the project root with the Pages deployment configuration (included in this project)

2. **Configure GitLab Pages**:
   - Go to your project in GitLab
   - Settings → Pages
   - Ensure "Deployments → Pages" shows as active

3. **Push to deploy**:
   ```bash
   git push origin main
   # GitLab CI/CD will automatically build and deploy
   ```

4. **Access your site**:
   - URL format: `https://{username}.gitlab.io/{project-name}`
   - Example: `https://jaylove.gitlab.io/prague-metro-photos`

### Important: Base Path Configuration

The application automatically detects if it's running under a project path (like GitLab Pages) and adjusts asset paths accordingly. No manual configuration needed.

## Image Guidelines

### Format and Size

- **Format**: JPEG (recommended for file size) or PNG
- **Dimensions**: Square (1:1 aspect ratio) recommended
- **Size**: 300×300 to 800×800 pixels (larger is fine; browser will scale)
- **File Size**: Optimize for web (< 500 KB per image recommended)

### Naming Convention

Use lowercase filenames with hyphens (not spaces or underscores):
- ✅ `dejvicka.jpg`
- ✅ `mustek-a.jpg`
- ❌ `Dejvická.jpg` (spaces/accents in filename)
- ❌ `mustek_a.jpg` (underscore instead of hyphen)

### Organization

Place images in the correct line folder:
- `/images/A/` for Line A photographs
- `/images/B/` for Line B photographs
- `/images/C/` for Line C photographs

## Technical Details

### Technologies

- **HTML5**: Semantic markup
- **CSS3**: Responsive flexbox and grid layouts
- **JavaScript (Vanilla)**: No frameworks required
- **SVG**: Vector-based metro map rendering
- **JSON**: Station data storage

### Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

### Performance

- No external dependencies (except for image assets)
- Fast initial load
- Images lazy-loaded by browser
- Static site—no database queries

### Accessibility

- Semantic HTML structure
- Keyboard navigation support
- ARIA labels on interactive elements
- Sufficient colour contrast
- Readable font sizes at all breakpoints

## Customization

### Change Line Colours

Edit the `lineColors` in `data/stations.json`:

```json
"lineColors": {
  "A": "#00A84F",
  "B": "#FFD100",
  "C": "#E4001B"
}
```

Or modify the CSS in `css/styles.css`.

### Adjust Map Scale

In `js/metro-map.js`, change the `SCALE` constant:

```javascript
const SCALE = 40; // pixels per coordinate unit (default)
```

Increase for larger map, decrease for smaller.

### Change Tile Sizes

In `js/metro-map.js`:

```javascript
const STATION_SIZE = 50;        // Normal station tile size
const INTERCHANGE_SIZE = 40;    // Interchange tile size
```

## Troubleshooting

### Images Not Showing

1. Check that image files exist at the correct paths
2. Verify `datePhotographed` is set in `data/stations.json` (not `null`)
3. Check browser console for errors (F12 → Console)
4. Ensure image filenames match exactly (case-sensitive on some servers)

### Progress Not Updating

1. Verify `datePhotographed` is in ISO format (`"YYYY-MM-DD"`)
2. Check that the station entry has all required targets listed
3. Ensure `data/stations.json` is valid JSON (use a JSON validator)
4. Refresh browser (Ctrl/Cmd + Shift + R for hard refresh)

### Map Layout Issues on Mobile

1. This is normal—the map may scroll horizontally on small screens
2. Zoom out or rotate to landscape if needed
3. The layout is responsive; try different screen sizes

### GitLab Pages Not Updating

1. Check that `.gitlab-ci.yml` exists and is properly formatted
2. Verify branch protection rules aren't blocking deployment
3. Check pipeline status in GitLab (CI/CD → Pipelines)
4. Clear browser cache (Ctrl/Cmd + Shift + Delete)

## Future Enhancements

Potential additions (not required for current functionality):

- Filter stations by line
- Search by station name
- Statistics dashboard (photos per week, coverage maps)
- Timeline view of photographed stations
- Geographic location information
- Social sharing
- Photo gallery per station (multiple angles)

## License

This project is for personal use. Feel free to adapt it for your own purposes.

## Contact / Questions

For issues or questions about this website, check the project repository or documentation.

---

**Happy photographing! Happy Metro exploring!** 🚇📷

Current progress: 0 / 61 stations photographed (0%)

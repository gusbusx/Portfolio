# Augusto Segura — Portfolio

Interactive 3D portfolio. Scroll to travel a fixed-camera cinematic journey:

1. Home — Earth in space, interactive "Gus" title, aurora + flickering stars
2. About — zooms into Earth, transitions up to One World Trade Center (looking up)
3. Projects — Times Square / cyberpunk streets (2KD, Study Weapon, then CloudDrop)
4. Work — drives down the avenue through the city; each job in a color-coded tab
5. Contact — zooms back out to Earth; contact form + social links

## Run it locally (VS Code)
Open this folder in VS Code, install the "Live Server" extension, then
right-click index.html -> "Open with Live Server" (or click "Go Live" in the status bar).

Or from a terminal in this folder:
    python3 -m http.server 8000
then open http://localhost:8000

You can't just double-click index.html — 3D models need a local server.

## Deploy free (GitHub Pages)
1. New public repo under gusbusx (e.g. `portfolio`).
2. Upload everything, keeping structure (index.html, app.js, models/, vendor/).
3. Settings -> Pages -> Deploy from branch -> main / root.
4. Live at https://gusbusx.github.io/portfolio/

## Tweaking (app.js)
- Camera angles per section: the POSES array
- The "drive" through the city: the section-3 block in updateCamera()
- Brightness / night look: renderer.toneMappingExposure and the lights
- Interactive title: the "Gus" block in index.html's inline script

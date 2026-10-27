# Assets Directory & Custom Character Guide

This directory holds the visual branding, icons, and character graphics used by SpiderReminder.

The repository includes original bundled placeholder assets (`placeholder-character.png`, `icon.png`, and `icon.ico`) so that the application runs cleanly out-of-the-box without requiring proprietary media.

---

## Bringing Your Own Custom Character

You can customize the hanging character and overlay animation with your own 2D sprite or 3D model. SpiderReminder will automatically look for these files at runtime:

### 1. 2D Sprite Character (`assets/character.png`)
- **File Name**: `character.png`
- **Format**: PNG with alpha transparency (`RGBA`)
- **Recommended Dimensions**: 512×512 px to 1024×1024 px (aspect ratio approx. 1:1 to 1:1.2 vertical)
- **Design Notes**: Character should be rendered in an upside-down hanging pose, with the top of the image aligning with the web strand anchor.
- **Fallback**: If `character.png` is not provided, the app automatically displays `placeholder-character.png`.

### 2. 3D GLB Character (`assets/character.glb`) (Optional)
- **File Name**: `character.glb`
- **Format**: Binary glTF (`.glb`)
- **Max Recommended Size**: < 15 MB
- **Coordinate Space**: Y-up, centered origin, with inverted Z or upside-down orientation.
- **Fallback**: If no 3D `.glb` is provided, the overlay automatically falls back to the 2D image character.

---

## Application Icons

- `icon.png`: 256×256 px PNG used for the system tray, notification balloons, and window titles.
- `icon.ico`: Multi-size Windows icon file (16×16, 32×32, 48×48, 64×64, 128×128, 256×256 px) used for packaging with Electron Builder.
- `placeholder-character.png`: 512×512 px PNG bundled original mascot used as default character artwork.

# Quick Page Snap 📸

A powerful browser extension that lets you capture, edit, and download FULL PAGE web page screenshots with ease. No cloud uploads, no tracking - everything happens locally in your browser!

![Version](https://img.shields.io/badge/version-2.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Privacy](https://img.shields.io/badge/privacy-100%20local-brightgreen)

## ✨ Features

### 🖼️ Full Page Screenshots
- Capture entire web pages, not just the visible area
- Automatic scrolling and stitching technology
- Handles pages of any length
- Progress indicator shows capture status

### 🎨 Built-in Editor
- **Crop Tool**: Select and keep only the parts you want
- **Highlight Tool**: Mark important areas with yellow highlight
- **Reset**: Start over with original screenshot
- **Download**: Save your edited screenshot

### 🚀 High Quality
- Captures at device pixel ratio for sharp images
- Maintains original quality
- Handles fixed headers and dynamic content
- No compression artifacts

### 🔒 Privacy First
- 100% local processing
- No data collection
- No tracking
- No cloud uploads
- Temporary storage only (auto-deleted)

## 📦 Installation

### From Chrome Web Store
1. Visit [Quick Page Snap on Chrome Web Store](#) (link coming soon)
2. Click "Add to Chrome"
3. Confirm the installation

### Manual Installation (Developer Mode)
1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the extension folder

## 🎯 How to Use

### Taking a Screenshot
1. Navigate to any webpage you want to capture
2. Click the Quick Page Snap icon in your toolbar
3. Click the **"Capture Now"** button
4. Watch as the extension automatically scrolls and captures the full page
5. The editor will open automatically with your screenshot

### Editing Your Screenshot
1. **Crop**: Click the "Crop" button, then drag to select an area
2. **Highlight**: Click "Highlight" and drag to mark important sections
3. **Reset**: Click "Reset" to start over
4. **Download**: Click "Download" to save your edited image

## 🔧 Technical Details

### Permissions Required
- `activeTab`: Capture current tab content
- `scripting`: Enable full-page scrolling capture
- `storage`: Temporary local storage for screenshot transfer
- `host_permissions`: Access to all URLs (only when you click capture)

### How It Works
1. When you click "Capture Now", the extension injects a script into the page
2. It calculates the full page dimensions
3. The page is scrolled and captured section by section
4. All captures are stitched together into one high-resolution image
5. The final image is temporarily stored locally and opened in the editor
6. Temporary storage is automatically cleared after use

document.getElementById("captureBtn").addEventListener("click", async () => {
    const statusEl = document.getElementById("status");
    statusEl.textContent = "Preparing full page capture...";

    try {
        // Get the current active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        // First, inject a content script to get page dimensions
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: preparePageForCapture,
        });

        // Get page dimensions and device pixel ratio from the page
        const dimensions = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: getPageDimensions,
        });

        const dims = dimensions[0].result;
        
        // Use the page's device pixel ratio for quality scaling
        const scale = dims.pixelRatio || 2;
        
        // Create a high-resolution canvas
        const canvas = document.createElement('canvas');
        canvas.width = dims.fullWidth * scale;
        canvas.height = dims.fullHeight * scale;
        const ctx = canvas.getContext('2d');
        
        // Enable image smoothing for better quality
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        // Calculate number of screenshots needed with 50px overlap to ensure we don't miss content
        const overlap = 50; // Small overlap to ensure we capture everything
        const rows = Math.ceil(dims.fullHeight / (dims.viewportHeight - overlap));
        const cols = Math.ceil(dims.fullWidth / (dims.viewportWidth - overlap));
        
        statusEl.textContent = `Capturing 0%`;
        
        // Keep track of the maximum Y position we've captured
        let maxCapturedY = 0;
        
        // Capture each section
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                // Calculate scroll position with overlap
                const scrollX = col * (dims.viewportWidth - overlap);
                const scrollY = row * (dims.viewportHeight - overlap);
                
                // Ensure we don't scroll beyond the page
                const actualScrollX = Math.min(scrollX, dims.fullWidth - dims.viewportWidth);
                const actualScrollY = Math.min(scrollY, dims.fullHeight - dims.viewportHeight);
                
                // Skip if we've already captured this area
                if (actualScrollY + dims.viewportHeight <= maxCapturedY && maxCapturedY > 0) {
                    continue;
                }
                
                // Scroll to position
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: (x, y) => {
                        window.scrollTo({
                            left: x,
                            top: y,
                            behavior: 'auto'
                        });
                        
                        // Force a reflow
                        window.getComputedStyle(document.body).height;
                        window.dispatchEvent(new Event('scroll'));
                        
                        return new Promise(resolve => setTimeout(resolve, 300));
                    },
                    args: [actualScrollX, actualScrollY]
                });

                // Capture the visible tab
                const dataUrl = await chrome.tabs.captureVisibleTab(null, { 
                    format: 'png'
                });
                
                // Create image from dataUrl
                const img = await createImageFromDataUrl(dataUrl);
                
                // Calculate the portion of this screenshot that contains new content
                // We need to skip the overlapping part
                let sourceY = 0;
                let captureHeight = dims.viewportHeight;
                
                // If we're not at the first row, we need to skip the overlap
                if (row > 0) {
                    sourceY = overlap;
                    captureHeight = dims.viewportHeight - overlap;
                }
                
                // For the last row, we need to ensure we don't capture beyond the page
                if (actualScrollY + dims.viewportHeight > dims.fullHeight) {
                    const remainingHeight = dims.fullHeight - actualScrollY;
                    captureHeight = Math.min(captureHeight, remainingHeight);
                }
                
                // Calculate where to draw on the final canvas
                const drawY = actualScrollY + (row > 0 ? overlap : 0);
                
                // Draw only the new portion on canvas
                ctx.drawImage(img, 
                    0, sourceY, dims.viewportWidth, captureHeight, // Source (skip overlap)
                    actualScrollX * scale, drawY * scale, dims.viewportWidth * scale, captureHeight * scale // Destination
                );
                
                // Update max captured Y
                maxCapturedY = Math.max(maxCapturedY, drawY + captureHeight);
                
                const progress = Math.round(((row * cols + col + 1) / (rows * cols)) * 100);
                statusEl.textContent = `Capturing ${progress}%`;
            }
        }
        
        // Restore original scroll position
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (x, y) => window.scrollTo(x, y),
            args: [dims.originalScrollX, dims.originalScrollY]
        });
        
        // Clean up
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: cleanupAfterCapture,
        });
        
        // Crop canvas to exact dimensions if needed
        if (maxCapturedY * scale < canvas.height) {
            console.log(`Cropping canvas from ${canvas.height} to ${maxCapturedY * scale}`);
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = canvas.width;
            tempCanvas.height = maxCapturedY * scale;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(canvas, 0, 0);
            
            // Convert to data URL
            const finalDataUrl = tempCanvas.toDataURL('image/png');
            
            // Generate a unique key for storage
            const storageKey = 'screenshot_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            
            // Store in local storage
            await chrome.storage.local.set({ [storageKey]: finalDataUrl });
            
            // Open editor with storage key
            chrome.tabs.create({
                url: chrome.runtime.getURL("editor.html") + "?key=" + storageKey,
                active: true
            });
        } else {
            // Convert canvas to data URL
            const finalDataUrl = canvas.toDataURL('image/png');
            
            // Generate a unique key for storage
            const storageKey = 'screenshot_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            
            // Store in local storage
            await chrome.storage.local.set({ [storageKey]: finalDataUrl });
            
            // Open editor with storage key
            chrome.tabs.create({
                url: chrome.runtime.getURL("editor.html") + "?key=" + storageKey,
                active: true
            });
        }

        statusEl.textContent = "Opening editor...";
        setTimeout(() => window.close(), 1000);

    } catch (error) {
        statusEl.textContent = "Failed: " + error.message;
        console.error("Full page screenshot error:", error);
    }
});

function createImageFromDataUrl(dataUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = (e) => {
            console.error("Failed to load image from dataUrl:", e);
            reject(new Error("Failed to load image"));
        };
        img.src = dataUrl;
    });
}

// Functions to be injected into the page
function preparePageForCapture() {
    // Disable smooth scrolling and animations
    const style = document.createElement('style');
    style.id = 'screenshot-temp-style';
    style.textContent = `
        html { scroll-behavior: auto !important; }
        * { 
            transition: none !important; 
            animation: none !important;
            -webkit-animation: none !important;
        }
        /* Hide scrollbars temporarily */
        body::-webkit-scrollbar, 
        html::-webkit-scrollbar {
            display: none !important;
            width: 0 !important;
            height: 0 !important;
        }
        body, html {
            scrollbar-width: none !important;
            -ms-overflow-style: none !important;
        }
    `;
    document.head.appendChild(style);
    
    // Force all images to load
    document.querySelectorAll('img').forEach(img => {
        if (!img.complete) {
            img.loading = 'eager';
        }
    });
    
    // Remove any body margin/padding
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    
    return "Page prepared";
}

function getPageDimensions() {
    // Get device pixel ratio from the page
    const pixelRatio = window.devicePixelRatio || 1;
    
    // Get the actual content dimensions
    const fullWidth = Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
        document.documentElement.offsetWidth,
        document.body.offsetWidth
    );
    
    const fullHeight = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
        document.documentElement.offsetHeight,
        document.body.offsetHeight
    );
    
    // Get viewport dimensions
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    return {
        fullWidth: fullWidth,
        fullHeight: fullHeight,
        viewportWidth: viewportWidth,
        viewportHeight: viewportHeight,
        originalScrollX: window.scrollX,
        originalScrollY: window.scrollY,
        pixelRatio: pixelRatio
    };
}

function cleanupAfterCapture() {
    const style = document.getElementById('screenshot-temp-style');
    if (style) {
        style.remove();
    }
    
    // Restore body styles
    document.body.style.margin = '';
    document.body.style.padding = '';
    
    return "Cleaned up";
}
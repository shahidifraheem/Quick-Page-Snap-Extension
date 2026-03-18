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

        // Use lower scale to reduce size
        const scale = 1; // Use 1x scale to keep size manageable

        // Create a high-resolution canvas
        const canvas = document.createElement('canvas');
        canvas.width = dims.fullWidth * scale;
        canvas.height = dims.fullHeight * scale;
        const ctx = canvas.getContext('2d');

        // Enable image smoothing for better quality
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Calculate number of screenshots needed with 50px overlap
        const overlap = 50;
        const rows = Math.ceil(dims.fullHeight / (dims.viewportHeight - overlap));
        const cols = Math.ceil(dims.fullWidth / (dims.viewportWidth - overlap));

        statusEl.textContent = `Capturing 0%`;

        // Keep track of the maximum Y position we've captured
        let maxCapturedY = 0;

        // Capture each section
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const scrollX = col * (dims.viewportWidth - overlap);
                const scrollY = row * (dims.viewportHeight - overlap);

                const actualScrollX = Math.min(scrollX, dims.fullWidth - dims.viewportWidth);
                const actualScrollY = Math.min(scrollY, dims.fullHeight - dims.viewportHeight);

                if (actualScrollY + dims.viewportHeight <= maxCapturedY && maxCapturedY > 0) {
                    continue;
                }

                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: (x, y) => {
                        window.scrollTo({
                            left: x,
                            top: y,
                            behavior: 'auto'
                        });

                        window.getComputedStyle(document.body).height;
                        window.dispatchEvent(new Event('scroll'));

                        return new Promise(resolve => setTimeout(resolve, 300));
                    },
                    args: [actualScrollX, actualScrollY]
                });

                const dataUrl = await chrome.tabs.captureVisibleTab(null, {
                    format: 'png'
                });

                const img = await createImageFromDataUrl(dataUrl);

                let sourceY = 0;
                let captureHeight = dims.viewportHeight;

                if (row > 0) {
                    sourceY = overlap;
                    captureHeight = dims.viewportHeight - overlap;
                }

                if (actualScrollY + dims.viewportHeight > dims.fullHeight) {
                    const remainingHeight = dims.fullHeight - actualScrollY;
                    captureHeight = Math.min(captureHeight, remainingHeight);
                }

                const drawY = actualScrollY + (row > 0 ? overlap : 0);

                ctx.drawImage(img,
                    0, sourceY, dims.viewportWidth, captureHeight,
                    actualScrollX * scale, drawY * scale, dims.viewportWidth * scale, captureHeight * scale
                );

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
        let finalCanvas = canvas;
        if (maxCapturedY * scale < canvas.height) {
            console.log(`Cropping canvas from ${canvas.height} to ${maxCapturedY * scale}`);
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = canvas.width;
            tempCanvas.height = maxCapturedY * scale;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(canvas, 0, 0);
            finalCanvas = tempCanvas;
        }

        // Use aggressive compression
        statusEl.textContent = "Compressing screenshot...";
        const compressedDataUrl = await aggressiveCompress(finalCanvas);

        // Generate a unique key for storage
        const storageKey = 'screenshot_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

        // Store in local storage
        await chrome.storage.local.set({ [storageKey]: compressedDataUrl });

        console.log("Screenshot stored with key:", storageKey);

        // Open editor with storage key
        chrome.tabs.create({
            url: chrome.runtime.getURL("editor.html") + "?key=" + storageKey,
            active: true
        });

        statusEl.textContent = "Opening editor...";
        setTimeout(() => window.close(), 1000);

    } catch (error) {
        statusEl.textContent = "Failed: " + error.message;
        console.error("Full page screenshot error:", error);
    }
});

// Aggressive compression function
function aggressiveCompress(canvas) {
    return new Promise((resolve) => {
        // Start with very low quality
        const quality = 0.6;
        const dataUrl = canvas.toDataURL('image/jpeg', quality);

        // Check if we need even more compression
        const estimatedSize = dataUrl.length * 0.75;
        const maxSize = 4 * 1024 * 1024; // 4MB

        console.log(`Compressed size: ${Math.round(estimatedSize / 1024)}KB`);

        if (estimatedSize > maxSize) {
            // If still too large, reduce canvas size
            console.log("Still too large, reducing dimensions...");

            // Calculate scale factor to get under 4MB
            const scaleFactor = Math.sqrt(maxSize / estimatedSize) * 0.9; // 0.9 for safety

            const smallCanvas = document.createElement('canvas');
            smallCanvas.width = Math.floor(canvas.width * scaleFactor);
            smallCanvas.height = Math.floor(canvas.height * scaleFactor);

            const smallCtx = smallCanvas.getContext('2d');
            smallCtx.imageSmoothingEnabled = true;
            smallCtx.imageSmoothingQuality = 'high';
            smallCtx.drawImage(canvas, 0, 0, smallCanvas.width, smallCanvas.height);

            // Compress again
            const finalDataUrl = smallCanvas.toDataURL('image/jpeg', 0.7);
            console.log(`Final size: ${Math.round((finalDataUrl.length * 0.75) / 1024)}KB`);
            resolve(finalDataUrl);
        } else {
            resolve(dataUrl);
        }
    });
}

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
    const style = document.createElement('style');
    style.id = 'screenshot-temp-style';
    style.textContent = `
        html { scroll-behavior: auto !important; }
        * { 
            transition: none !important; 
            animation: none !important;
            -webkit-animation: none !important;
        }
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

    document.querySelectorAll('img').forEach(img => {
        if (!img.complete) {
            img.loading = 'eager';
        }
    });

    document.body.style.margin = '0';
    document.body.style.padding = '0';

    return "Page prepared";
}

function getPageDimensions() {
    const pixelRatio = window.devicePixelRatio || 1;

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

    document.body.style.margin = '';
    document.body.style.padding = '';

    return "Cleaned up";
}

document.getElementById("explore-btn").addEventListener("click", () => {
    chrome.tabs.create({ url: "https://codersship.com/" });
});
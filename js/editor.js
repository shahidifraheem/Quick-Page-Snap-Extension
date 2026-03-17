document.addEventListener('DOMContentLoaded', async () => {
    // Get screenshot data from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const storageKey = urlParams.get('key');

    // Exit if no key is found
    if (!storageKey) {
        alert('No screenshot key found');
        window.close();
        return;
    }

    // Initialize canvas and context
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const statusEl = document.createElement('div');
    statusEl.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0,0,0,0.8);
        color: white;
        padding: 20px;
        border-radius: 10px;
        z-index: 9999;
    `;
    statusEl.textContent = "Loading screenshot...";
    document.body.appendChild(statusEl);

    try {
        // Retrieve the image from storage
        console.log("Retrieving screenshot with key:", storageKey);
        const result = await chrome.storage.local.get(storageKey);
        const imageSrc = result[storageKey];
        
        if (!imageSrc) {
            throw new Error("Screenshot not found in storage");
        }
        
        console.log("Screenshot retrieved, length:", imageSrc.length);
        
        // Clean up storage (optional - you might want to keep it)
        chrome.storage.local.remove(storageKey);
        
        // Load the image
        const img = new Image();
        
        img.onload = function() {
            console.log("Image loaded successfully, dimensions:", img.width, "x", img.height);
            
            // Set canvas dimensions
            canvas.width = img.width;
            canvas.height = img.height;
            
            // Draw image
            ctx.drawImage(img, 0, 0);
            
            // Remove loading status
            document.body.removeChild(statusEl);
            
            // Adjust canvas container for large images
            const container = document.querySelector('.canvas-container');
            if (img.width > window.innerWidth * 0.9) {
                container.style.maxWidth = '95%';
                canvas.style.width = '100%';
                canvas.style.height = 'auto';
            }
        };
        
        img.onerror = function(e) {
            console.error("Failed to load image:", e);
            statusEl.textContent = "Failed to load screenshot";
            statusEl.style.background = "rgba(255,0,0,0.8)";
            setTimeout(() => {
                document.body.removeChild(statusEl);
            }, 3000);
        };
        
        img.src = imageSrc;
        
    } catch (error) {
        console.error("Error loading screenshot:", error);
        statusEl.textContent = "Error: " + error.message;
        statusEl.style.background = "rgba(255,0,0,0.8)";
        setTimeout(() => {
            document.body.removeChild(statusEl);
        }, 3000);
    }

    // Editor state management
    let isCropping = false;
    let isHighlighting = false;
    let startX, startY;
    let currentHighlight = null;
    let selectionRect = null;
    let isSelecting = false;

    // Tool button references
    const cropBtn = document.getElementById('cropBtn');
    const highlightBtn = document.getElementById('highlightBtn');
    const resetBtn = document.getElementById('resetBtn');
    const downloadBtn = document.getElementById('downloadBtn');

    canvas.style.cursor = 'default';

    // Activate crop mode
    cropBtn.addEventListener('click', () => {
        isCropping = true;
        isHighlighting = false;
        canvas.style.cursor = 'crosshair';
        cropBtn.classList.add('active');
        highlightBtn.classList.remove('active');
    });

    // Toggle highlight mode
    highlightBtn.addEventListener('click', () => {
        isHighlighting = !isHighlighting;
        isCropping = false;
        canvas.style.cursor = isHighlighting ? 'crosshair' : 'default';
        highlightBtn.classList.toggle('active', isHighlighting);
        cropBtn.classList.remove('active');
    });

    // Reload the page to reset the canvas and tools
    resetBtn.addEventListener("click", function () {
        window.location.reload();
    });

    // Download the modified canvas including highlights
    downloadBtn.addEventListener('click', () => {
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = canvas.width;
        finalCanvas.height = canvas.height;
        const finalCtx = finalCanvas.getContext('2d');

        // Copy base image to final canvas
        finalCtx.drawImage(canvas, 0, 0);

        // Overlay highlight rectangles
        const highlights = document.querySelectorAll('.highlight');
        highlights.forEach(highlight => {
            const rect = canvas.getBoundingClientRect();
            const container = canvas.parentElement.getBoundingClientRect();

            const left = parseFloat(highlight.style.left) - (container.left - rect.left);
            const top = parseFloat(highlight.style.top) - (container.top - rect.top);
            const width = parseFloat(highlight.style.width);
            const height = parseFloat(highlight.style.height);

            finalCtx.fillStyle = '#ffff001a';
            finalCtx.fillRect(left, top, width, height);

            finalCtx.strokeStyle = 'red';
            finalCtx.setLineDash([5, 3]);
            finalCtx.lineWidth = 2;
            finalCtx.strokeRect(left, top, width, height);
        });

        // Trigger download of final image
        const link = document.createElement('a');
        link.download = `screenshot_${new Date().getTime()}.png`;
        link.href = finalCanvas.toDataURL('image/png');
        link.click();
    });

    // Convert mouse event to canvas coordinates
    function getCanvasCoordinates(event) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (event.clientX - rect.left) * scaleX,
            y: (event.clientY - rect.top) * scaleY,
            clientX: event.clientX - rect.left,
            clientY: event.clientY - rect.top
        };
    }

    // Handle mouse down for crop or highlight initiation
    canvas.addEventListener('mousedown', (e) => {
        if (!canvas.width) return; // Don't allow editing if no image loaded
        
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const clientX = e.clientX - rect.left;
        const clientY = e.clientY - rect.top;

        const x = clientX * scaleX;
        const y = clientY * scaleY;

        startX = x;
        startY = y;

        // Start creating highlight overlay
        if (isHighlighting) {
            currentHighlight = document.createElement('div');
            currentHighlight.className = 'highlight';
            currentHighlight.style.position = 'absolute';
            currentHighlight.style.left = `${clientX}px`;
            currentHighlight.style.top = `${clientY}px`;
            canvas.parentNode.appendChild(currentHighlight);
        }

        // Start crop rectangle overlay
        if (isCropping) {
            isSelecting = true;
            selectionRect = document.createElement('div');
            selectionRect.className = 'selection-rectangle';
            selectionRect.style.position = 'absolute';
            selectionRect.style.left = `${clientX}px`;
            selectionRect.style.top = `${clientY}px`;
            selectionRect.style.width = '0px';
            selectionRect.style.height = '0px';
            canvas.parentNode.appendChild(selectionRect);
        }
    });

    // Handle mouse move for adjusting highlight or crop area
    canvas.addEventListener('mousemove', (e) => {
        if (!canvas.width) return;
        if (!isHighlighting && !isCropping) return;
        if (startX == null || startY == null) return;

        const rect = canvas.getBoundingClientRect();

        const clientX = e.clientX - rect.left;
        const clientY = e.clientY - rect.top;

        // Adjust highlight box size and position
        if (isHighlighting && currentHighlight) {
            const width = clientX - (parseFloat(currentHighlight.style.left || 0));
            const height = clientY - (parseFloat(currentHighlight.style.top || 0));
            
            currentHighlight.style.width = `${Math.abs(width)}px`;
            currentHighlight.style.height = `${Math.abs(height)}px`;
            currentHighlight.style.left = `${width < 0 ? clientX : clientX - width}px`;
            currentHighlight.style.top = `${height < 0 ? clientY : clientY - height}px`;
        }

        // Adjust crop selection rectangle size and position
        if (isCropping && isSelecting && selectionRect) {
            const cropWidth = clientX - parseFloat(selectionRect.style.left);
            const cropHeight = clientY - parseFloat(selectionRect.style.top);

            selectionRect.style.width = `${Math.abs(cropWidth)}px`;
            selectionRect.style.height = `${Math.abs(cropHeight)}px`;
            selectionRect.style.left = `${cropWidth < 0 ? clientX : clientX - cropWidth}px`;
            selectionRect.style.top = `${cropHeight < 0 ? clientY : clientY - cropHeight}px`;
        }
    });

    // Handle mouse up to apply crop or finalize highlight
    canvas.addEventListener('mouseup', (e) => {
        if (!canvas.width) return;
        if (!(isCropping || isHighlighting) || startX == null || startY == null) return;

        const { x: endX, y: endY } = getCanvasCoordinates(e);

        // Perform cropping using selection rectangle
        if (isCropping && isSelecting && selectionRect) {
            const cropX = Math.min(startX, endX);
            const cropY = Math.min(startY, endY);
            const cropWidth = Math.abs(endX - startX);
            const cropHeight = Math.abs(endY - startY);

            if (cropWidth > 10 && cropHeight > 10) {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = cropWidth;
                tempCanvas.height = cropHeight;
                const tempCtx = tempCanvas.getContext('2d');

                tempCtx.drawImage(canvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

                canvas.width = cropWidth;
                canvas.height = cropHeight;
                ctx.drawImage(tempCanvas, 0, 0);
            }

            // Remove selection rectangle
            selectionRect.remove();
            selectionRect = null;
        }

        // Reset interaction state
        isCropping = false;
        isSelecting = false;
        startX = startY = null;
    });
});
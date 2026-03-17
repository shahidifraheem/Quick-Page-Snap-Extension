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

    // Store original canvas dimensions for highlight scaling
    let originalCanvasWidth = 0;
    let originalCanvasHeight = 0;

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
    const downloadBtn = document.getElementById('downloadBtn');

    canvas.style.cursor = 'default';

    try {
        // Retrieve the image from storage
        console.log("Retrieving screenshot with key:", storageKey);
        const result = await chrome.storage.local.get(storageKey);
        const imageSrc = result[storageKey];
        
        if (!imageSrc) {
            throw new Error("Screenshot not found in storage");
        }
        
        console.log("Screenshot retrieved, length:", imageSrc.length);
        
        // Clean up storage
        chrome.storage.local.remove(storageKey);
        
        // Load the image
        const img = new Image();
        
        img.onload = function() {
            console.log("Image loaded successfully, dimensions:", img.width, "x", img.height);
            
            // Set original dimensions
            originalCanvasWidth = img.width;
            originalCanvasHeight = img.height;
            
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

    // Download the modified canvas including highlights
    downloadBtn.addEventListener('click', () => {
        // Create a new canvas for the final image
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = canvas.width;
        finalCanvas.height = canvas.height;
        const finalCtx = finalCanvas.getContext('2d');

        // Copy the current canvas (which may be cropped) to the final canvas
        finalCtx.drawImage(canvas, 0, 0);

        // Get all highlight elements
        const highlights = document.querySelectorAll('.highlight');
        
        // Get the container and canvas positions
        const container = canvas.parentElement;
        const containerRect = container.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();
        
        // Calculate the offset between container and canvas
        const offsetLeft = canvasRect.left - containerRect.left;
        const offsetTop = canvasRect.top - containerRect.top;
        
        // Calculate scale factors if the canvas display size differs from actual size
        const displayWidth = canvasRect.width;
        const displayHeight = canvasRect.height;
        const actualWidth = canvas.width;
        const actualHeight = canvas.height;
        
        const scaleX = actualWidth / displayWidth;
        const scaleY = actualHeight / displayHeight;

        // Draw each highlight on the final canvas
        highlights.forEach(highlight => {
            // Get highlight position relative to container
            const highlightLeft = parseFloat(highlight.style.left) || 0;
            const highlightTop = parseFloat(highlight.style.top) || 0;
            const highlightWidth = parseFloat(highlight.style.width) || 0;
            const highlightHeight = parseFloat(highlight.style.height) || 0;
            
            // Adjust for container offset to get position relative to canvas
            const canvasRelativeLeft = highlightLeft - offsetLeft;
            const canvasRelativeTop = highlightTop - offsetTop;
            
            // Scale to actual canvas coordinates
            const actualLeft = canvasRelativeLeft * scaleX;
            const actualTop = canvasRelativeTop * scaleY;
            const actualWidth = highlightWidth * scaleX;
            const actualHeight = highlightHeight * scaleY;
            
            // Ensure we're within canvas bounds
            if (actualLeft >= 0 && actualTop >= 0 && 
                actualLeft + actualWidth <= canvas.width && 
                actualTop + actualHeight <= canvas.height) {
                
                // Draw highlight fill
                finalCtx.fillStyle = '#ffff001a';
                finalCtx.fillRect(actualLeft, actualTop, actualWidth, actualHeight);
                
                // Draw highlight border
                finalCtx.strokeStyle = 'red';
                finalCtx.setLineDash([5, 3]);
                finalCtx.lineWidth = 2;
                finalCtx.strokeRect(actualLeft, actualTop, actualWidth, actualHeight);
            }
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

        // Finalize highlight
        if (isHighlighting && currentHighlight) {
            // Highlight is already drawn on screen, just reset
            currentHighlight = null;
        }

        // Perform cropping using selection rectangle
        if (isCropping && isSelecting && selectionRect) {
            const cropX = Math.min(startX, endX);
            const cropY = Math.min(startY, endY);
            const cropWidth = Math.abs(endX - startX);
            const cropHeight = Math.abs(endY - startY);

            if (cropWidth > 10 && cropHeight > 10) {
                // Store current highlights before cropping
                const highlights = Array.from(document.querySelectorAll('.highlight')).map(h => {
                    const rect = canvas.getBoundingClientRect();
                    const container = canvas.parentElement.getBoundingClientRect();
                    
                    return {
                        element: h,
                        left: parseFloat(h.style.left) - (container.left - rect.left),
                        top: parseFloat(h.style.top) - (container.top - rect.top),
                        width: parseFloat(h.style.width),
                        height: parseFloat(h.style.height)
                    };
                });

                // Perform crop
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = cropWidth;
                tempCanvas.height = cropHeight;
                const tempCtx = tempCanvas.getContext('2d');

                tempCtx.drawImage(canvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

                canvas.width = cropWidth;
                canvas.height = cropHeight;
                ctx.drawImage(tempCanvas, 0, 0);

                // Remove old highlights
                document.querySelectorAll('.highlight').forEach(h => h.remove());

                // Redraw highlights that are within the cropped area
                highlights.forEach(h => {
                    // Check if highlight is within crop area
                    if (h.left >= cropX && h.top >= cropY && 
                        h.left + h.width <= cropX + cropWidth && 
                        h.top + h.height <= cropY + cropHeight) {
                        
                        // Create new highlight with adjusted coordinates
                        const newHighlight = document.createElement('div');
                        newHighlight.className = 'highlight';
                        newHighlight.style.position = 'absolute';
                        
                        // Adjust coordinates relative to new canvas
                        const rect = canvas.getBoundingClientRect();
                        const container = canvas.parentElement.getBoundingClientRect();
                        
                        const newLeft = (h.left - cropX) * (rect.width / canvas.width);
                        const newTop = (h.top - cropY) * (rect.height / canvas.height);
                        const newWidth = h.width * (rect.width / canvas.width);
                        const newHeight = h.height * (rect.height / canvas.height);
                        
                        newHighlight.style.left = `${newLeft + (rect.left - container.left)}px`;
                        newHighlight.style.top = `${newTop + (rect.top - container.top)}px`;
                        newHighlight.style.width = `${newWidth}px`;
                        newHighlight.style.height = `${newHeight}px`;
                        
                        canvas.parentNode.appendChild(newHighlight);
                    }
                });
            }

            // Remove selection rectangle
            selectionRect.remove();
            selectionRect = null;
        }

        // Reset interaction state
        isCropping = false;
        isSelecting = false;
        isHighlighting = false;
        startX = startY = null;
        currentHighlight = null;
        
        // Reset button states
        cropBtn.classList.remove('active');
        highlightBtn.classList.remove('active');
        canvas.style.cursor = 'default';
    });
});
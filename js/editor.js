// Wait for the DOM to fully load before executing
document.addEventListener('DOMContentLoaded', async () => {
    // Get screenshot data from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const screenshotDataUrl = urlParams.get('screenshot');

    // Exit if no screenshot is found
    if (!screenshotDataUrl) {
        alert('No screenshot found');
        window.close();
        return;
    }

    // Initialize canvas and load the screenshot image
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = function () {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
    };
    img.src = screenshotDataUrl;

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
        if (!isHighlighting && !isCropping) return;
        if (startX == null || startY == null) return;

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const clientX = e.clientX - rect.left;
        const clientY = e.clientY - rect.top;

        const width = clientX - (parseFloat(currentHighlight?.style.left || 0));
        const height = clientY - (parseFloat(currentHighlight?.style.top || 0));

        // Adjust highlight box size and position
        if (isHighlighting && currentHighlight) {
            currentHighlight.style.width = `${Math.abs(width)}px`;
            currentHighlight.style.height = `${Math.abs(height)}px`;
            currentHighlight.style.left = `${width < 0 ? clientX : clientX - width}px`;
            currentHighlight.style.top = `${height < 0 ? clientY : clientY - height}px`;
        }

        // Adjust crop selection rectangle size and position
        if (isCropping && isSelecting && selectionRect) {
            const startClientX = e.clientX - rect.left;
            const startClientY = e.clientY - rect.top;

            const cropWidth = startClientX - parseFloat(selectionRect.style.left);
            const cropHeight = startClientY - parseFloat(selectionRect.style.top);

            selectionRect.style.width = `${Math.abs(cropWidth)}px`;
            selectionRect.style.height = `${Math.abs(cropHeight)}px`;
            selectionRect.style.left = `${cropWidth < 0 ? startClientX : startClientX - cropWidth}px`;
            selectionRect.style.top = `${cropHeight < 0 ? startClientY : startClientY - cropHeight}px`;
        }
    });

    // Handle mouse up to apply crop or finalize highlight
    canvas.addEventListener('mouseup', (e) => {
        if (!(isCropping || isHighlighting) || startX == null || startY == null) return;

        const { x: endX, y: endY } = getCanvasCoordinates(e);

        // Perform cropping using selection rectangle
        if (isCropping && isSelecting) {
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
            if (selectionRect) {
                selectionRect.remove();
                selectionRect = null;
            }
        }

        // Reset interaction state
        isCropping = false;
        isSelecting = false;
        startX = startY = null;
    });
});

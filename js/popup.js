document.getElementById("captureBtn").addEventListener("click", async () => {
    const statusEl = document.getElementById("status");
    statusEl.textContent = "Capturing...";

    try {
        // Get the current active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        // Capture the visible tab as PNG
        const dataUrl = await chrome.tabs.captureVisibleTab({ format: "png" });

        // Open editor in new tab
        chrome.tabs.create({
            url: chrome.runtime.getURL("editor.html") + "?screenshot=" + encodeURIComponent(dataUrl),
            active: true
        });

        statusEl.textContent = "Opening editor...";
        setTimeout(() => window.close(), 1000);
    } catch (error) {
        statusEl.textContent = "Failed";
        console.error("Screenshot error:", error);
    }
});
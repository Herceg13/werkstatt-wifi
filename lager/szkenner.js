let html5QrCode = null;
let isScanning = false;

function loadScanLib() {
    return new Promise((resolve, reject) => {
        if (window.Html5Qrcode) { resolve(); return; }
        const s = document.createElement('script');
        s.src = ['https://cdn.jsd', 'elivr.net/npm/', 'html5-qrcode@2.3.8/', 'html5-qrcode.min.js'].join('');
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    });
}

async function stopCam() {
    if (html5QrCode && isScanning) {
        try { await html5QrCode.stop(); html5QrCode.clear(); } catch (e) {}
    }
    isScanning = false;
    document.getElementById('camBox').style.display = 'none';
    document.getElementById('scanToggleBtn').innerText = '📷 BARCODE / POLC SZKENNELÉS';
}

async function toggleScanner() {
    const box = document.getElementById('camBox');
    const btn = document.getElementById('scanToggleBtn');
    if (isScanning) { await stopCam(); return; }

    btn.innerText = '⏳ SZKENNER BETÖLTÉSE...';
    try {
        await loadScanLib();
        box.style.display = 'block';
        html5QrCode = new Html5Qrcode("camBox");
        await html5QrCode.start(
            { facingMode: "environment" },
            { fps: 15, qrbox: { width: 280, height: 110 } },
            (decodedText) => {
                const raw = decodedText.trim();
                stopCam();
                if (typeof handleScannedCode === 'function') {
                    handleScannedCode(raw);
                }
            },
            () => {}
        );
        isScanning = true;
        btn.innerText = '⏹ KAMERA BEZÁRÁSA';
    } catch (err) {
        await stopCam();
        alert("Kamera / Hálózat hiba: " + err);
    }
}

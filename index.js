// Check for BarcodeDetector API
if (!('BarcodeDetector' in window)) {
    console.warn('BarcodeDetector API is not supported in this browser.');
}

class BarcodeScannerApp {
    constructor() {
        this.videoPreview = document.getElementById('video-preview');
        this.startButton = document.getElementById('startButton');
        this.stopButton = document.getElementById('stopButton');
        this.barcodeResultElement = document.getElementById('barcode-result');
        this.statusMessageElement = document.getElementById('status-message');
        this.overlayTextElement = document.getElementById('overlay-text');

        this.stream = null;
        this.barcodeDetector = null;
        this.animationFrameId = null;
        this.isScanning = false;
        this.supportedFormats = [];

        // Use the current origin for API calls
        this.apiBaseUrl = `${window.location.origin}/api`;
        this.scanHistory = [];

        this.availableCameras = [];
        this.currentCameraIndex = 0;
        this.isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

        // Add camera selection UI
        this.addCameraControls();

        this.init();
        this.addHistoryUI();
        this.loadScanHistory();
    }

    addCameraControls() {
        const controls = document.getElementById('controls');
        const cameraSelect = document.createElement('select');
        cameraSelect.id = 'camera-select';
        cameraSelect.className = 'camera-select';
        cameraSelect.setAttribute('aria-label', 'Select camera');

        const cameraLabel = document.createElement('label');
        cameraLabel.htmlFor = 'camera-select';
        cameraLabel.textContent = 'Camera: ';
        cameraLabel.className = 'camera-label';

        controls.insertBefore(cameraLabel, this.startButton);
        controls.insertBefore(cameraSelect, this.startButton);

        // Add camera switch button for mobile devices
        if (this.isMobileDevice) {
            const switchButton = document.createElement('button');
            switchButton.id = 'switchCameraButton';
            switchButton.className = 'switch-camera-button';
            switchButton.innerHTML = '🔄 Switch Camera';
            switchButton.setAttribute('aria-label', 'Switch between front and back cameras');
            switchButton.style.display = 'none';
            controls.insertBefore(switchButton, this.startButton);

            switchButton.addEventListener('click', () => this.switchCamera());
        }
    }

    async getAvailableCameras() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.availableCameras = devices.filter(device => device.kind === 'videoinput');

            const cameraSelect = document.getElementById('camera-select');
            cameraSelect.innerHTML = '';

            this.availableCameras.forEach((camera, index) => {
                const option = document.createElement('option');
                option.value = index;
                // Try to get a user-friendly label
                let label = camera.label || `Camera ${index + 1}`;
                // For mobile devices, try to identify front/back cameras
                if (this.isMobileDevice) {
                    if (camera.label.toLowerCase().includes('front')) {
                        label = 'Front Camera';
                    } else if (camera.label.toLowerCase().includes('back') ||
                        camera.label.toLowerCase().includes('rear')) {
                        label = 'Back Camera';
                    }
                }
                option.textContent = label;
                cameraSelect.appendChild(option);
            });

            // Show camera controls if multiple cameras are available
            const cameraControls = document.querySelector('.camera-label, .camera-select, .switch-camera-button');
            if (cameraControls) {
                cameraControls.style.display = this.availableCameras.length > 1 ? 'inline-block' : 'none';
            }
        } catch (error) {
            console.error('Error getting available cameras:', error);
            this.updateStatus('Could not get camera list', 'error');
        }
    }

    async switchCamera() {
        if (this.availableCameras.length <= 1) return;

        this.currentCameraIndex = (this.currentCameraIndex + 1) % this.availableCameras.length;
        const cameraSelect = document.getElementById('camera-select');
        cameraSelect.value = this.currentCameraIndex;

        if (this.isScanning) {
            await this.stopScan();
            await this.startScan();
        }
    }

    async init() {
        if (!('BarcodeDetector' in window)) {
            this.updateStatus('Barcode Detector API is not supported in this browser.', 'error');
            this.startButton.disabled = true;
            return;
        }

        try {
            // Request camera permission early to get camera list
            await navigator.mediaDevices.getUserMedia({ video: true });
            await this.getAvailableCameras();

            this.supportedFormats = await window.BarcodeDetector.getSupportedFormats();
            const commonFormats = ['qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'itf', 'data_matrix', 'pdf417', 'aztec'];
            const availableFormats = commonFormats.filter(format => this.supportedFormats.includes(format));

            this.barcodeDetector = new window.BarcodeDetector({
                formats: availableFormats.length > 0 ? availableFormats : commonFormats
            });
            this.updateStatus('Barcode Detector initialized. Click "Start Scanning".', 'info');
        } catch (error) {
            console.error('Error initializing BarcodeDetector:', error);
            this.updateStatus('Could not initialize Barcode Detector.', 'error');
            this.startButton.disabled = true;
            return;
        }

        // Add event listeners
        this.startButton.addEventListener('click', () => this.startScan());
        this.stopButton.addEventListener('click', () => this.stopScan());
        document.getElementById('camera-select').addEventListener('change', (e) => {
            this.currentCameraIndex = parseInt(e.target.value);
            if (this.isScanning) {
                this.stopScan().then(() => this.startScan());
            }
        });

        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.isScanning) {
                this.stopScan();
            }
        });
    }

    async startScan() {
        if (!this.barcodeDetector) {
            this.updateStatus('Barcode Detector not available.', 'error');
            return;
        }

        if (this.isScanning) return;

        this.isScanning = true;
        this.barcodeResultElement.textContent = 'N/A';
        this.updateStatus('Requesting camera access...', 'info');
        this.startButton.disabled = true;

        try {
            const constraints = {
                video: {
                    deviceId: this.availableCameras[this.currentCameraIndex]?.deviceId ?
                        { exact: this.availableCameras[this.currentCameraIndex].deviceId } :
                        undefined,
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: this.isMobileDevice ?
                        (this.currentCameraIndex === 0 ? 'environment' : 'user') :
                        undefined
                },
                audio: false
            };

            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.videoPreview.srcObject = this.stream;
            await this.videoPreview.play();

            // Update UI
            this.videoPreview.style.display = 'block';
            this.overlayTextElement.style.display = 'block';
            this.startButton.style.display = 'none';
            this.stopButton.style.display = 'inline-block';
            this.stopButton.disabled = false;
            document.getElementById('switchCameraButton')?.style.display = 'inline-block';
            document.getElementById('camera-select').disabled = true;

            this.updateStatus('Scanning... Align barcode with camera.', 'info');
            this.detectBarcode();
        } catch (error) {
            console.error('Error accessing camera:', error);
            let message = 'Could not access camera. Please ensure permission is granted.';
            if (error.name === "NotAllowedError") {
                message = 'Camera access denied. Please enable camera permission in your browser settings.';
            } else if (error.name === "NotFoundError") {
                message = 'No camera found. Please ensure a camera is connected and enabled.';
            }
            this.updateStatus(message, 'error');
            this.stopScan();
        }
    }

    stopScan(statusUpdate = null) {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        // Update UI
        this.videoPreview.style.display = 'none';
        this.videoPreview.srcObject = null;
        this.overlayTextElement.style.display = 'none';
        this.startButton.style.display = 'inline-block';
        this.startButton.disabled = false;
        this.stopButton.style.display = 'none';
        document.getElementById('switchCameraButton')?.style.display = 'none';
        document.getElementById('camera-select').disabled = false;

        this.isScanning = false;

        if (statusUpdate) {
            this.updateStatus(statusUpdate.message, statusUpdate.type);
        } else if (this.statusMessageElement.textContent === 'Scanning... Align barcode with camera.') {
            this.updateStatus('Scan stopped by user.', 'info');
        }
    }

    async detectBarcode() {
        if (!this.isScanning || !this.barcodeDetector ||
            this.videoPreview.readyState < this.videoPreview.HAVE_METADATA ||
            this.videoPreview.paused || this.videoPreview.ended) {
            if (this.isScanning) {
                this.animationFrameId = requestAnimationFrame(() => this.detectBarcode());
            }
            return;
        }

        try {
            const barcodes = await this.barcodeDetector.detect(this.videoPreview);
            if (barcodes.length > 0 && this.isScanning) {
                const firstBarcode = barcodes[0];
                const barcodeValue = firstBarcode.rawValue;
                this.barcodeResultElement.textContent = barcodeValue;

                // Save barcode to API
                await this.saveBarcode(barcodeValue);

                this.stopScan({
                    message: `Barcode detected (${firstBarcode.format}): ${barcodeValue}`,
                    type: 'success'
                });
                if (navigator.vibrate) {
                    navigator.vibrate(200);
                }
            } else if (this.isScanning) {
                this.animationFrameId = requestAnimationFrame(() => this.detectBarcode());
            }
        } catch (error) {
            console.error('Error during barcode detection:', error);
            if (this.isScanning) {
                this.animationFrameId = requestAnimationFrame(() => this.detectBarcode());
            }
        }
    }

    updateStatus(message, type = 'info') {
        this.statusMessageElement.textContent = message;
        this.statusMessageElement.className = 'status';
        if (type) {
            this.statusMessageElement.classList.add(type);
        }
    }

    addHistoryUI() {
        const resultContainer = document.getElementById('result-container');
        const historySection = document.createElement('div');
        historySection.id = 'scan-history';
        historySection.innerHTML = `
            <h2>Scan History</h2>
            <button id="clearHistoryButton" aria-label="Clear scan history">Clear History</button>
            <div id="history-list"></div>
        `;
        resultContainer.appendChild(historySection);

        document.getElementById('clearHistoryButton').addEventListener('click', () => this.clearHistory());
    }

    async loadScanHistory() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/scans`);
            const data = await response.json();
            if (data.success) {
                this.scanHistory = data.data;
                this.updateHistoryUI();
            }
        } catch (error) {
            console.error('Error loading scan history:', error);
            this.updateStatus('Could not load scan history', 'error');
        }
    }

    async clearHistory() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/scans`, {
                method: 'DELETE'
            });
            const data = await response.json();
            if (data.success) {
                this.scanHistory = [];
                this.updateHistoryUI();
                this.updateStatus('Scan history cleared', 'success');
            }
        } catch (error) {
            console.error('Error clearing scan history:', error);
            this.updateStatus('Could not clear scan history', 'error');
        }
    }

    updateHistoryUI() {
        const historyList = document.getElementById('history-list');
        historyList.innerHTML = this.scanHistory.length === 0
            ? '<p>No scans recorded</p>'
            : this.scanHistory.map(scan => `
                <div class="history-item">
                    <span class="barcode">${scan.barcode}</span>
                    <span class="timestamp">${new Date(scan.timestamp).toLocaleString()}</span>
                </div>
            `).join('');
    }

    async saveBarcode(barcode) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/scan`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ barcode })
            });
            const data = await response.json();
            if (data.success) {
                this.scanHistory.unshift(data.data);
                this.updateHistoryUI();
            }
        } catch (error) {
            console.error('Error saving barcode:', error);
            this.updateStatus('Could not save barcode to history', 'error');
        }
    }
}

// Initialize the app once the DOM is fully loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new BarcodeScannerApp());
} else {
    new BarcodeScannerApp();
}

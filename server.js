const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Configure CORS to allow requests from any origin during development
app.use(cors({
    origin: '*', // In production, you should restrict this to your specific domain
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type']
}));

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname))); // Serve static files from current directory

// Store scanned barcodes (in memory for this example)
let scannedBarcodes = [];

// API Endpoints
app.post('/api/scan', (req, res) => {
    const { barcode } = req.body;

    if (!barcode) {
        return res.status(400).json({ error: 'Barcode data is required' });
    }

    // Add timestamp to the scan
    const scanData = {
        barcode,
        timestamp: new Date().toISOString()
    };

    scannedBarcodes.push(scanData);

    res.json({
        success: true,
        data: scanData
    });
});

app.get('/api/scans', (req, res) => {
    res.json({
        success: true,
        data: scannedBarcodes
    });
});

app.delete('/api/scans', (req, res) => {
    scannedBarcodes = [];
    res.json({
        success: true,
        message: 'All scans cleared'
    });
});

// Serve index.html for the root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
if (require.main === module) {
    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
        console.log(`Open http://localhost:${port} in your browser`);
    });
}

// Export app for testing purposes
module.exports = app; 
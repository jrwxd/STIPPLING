import { Delaunay } from 'd3-delaunay';

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const fileInput = document.getElementById('upload');
const statusDiv = document.getElementById('status');
const pointInput = document.getElementById('pointCount');
const pointValue = document.getElementById('pointValue');

let width, height;
let points = [];
let nPoints = 2000; // Number of points
let density = []; // 1D array of density values
let isRunning = false;
let animationId;

const dropZone = document.getElementById('drop-zone');

// Handle image upload
fileInput.addEventListener('change', async (e) => {
    handleFiles(e.target.files);
});

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
        fileInput.files = e.dataTransfer.files;
        handleFiles(e.dataTransfer.files);
    }
});

async function handleFiles(files) {
    if (files.length === 0) return;
    const file = files[0];
    const bitmap = await createImageBitmap(file);

    // Resize image to reasonable dimensions for performance
    const maxDim = 800;
    let scale = 1;
    if (bitmap.width > maxDim || bitmap.height > maxDim) {
        scale = maxDim / Math.max(bitmap.width, bitmap.height);
    }
    width = Math.floor(bitmap.width * scale);
    height = Math.floor(bitmap.height * scale);

    canvas.width = width;
    canvas.height = height;

    // Draw image to canvas to extract data
    ctx.drawImage(bitmap, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);

    // Prepare density map (inverted brightness: dark = high density)
    density = new Float32Array(width * height);
    for (let i = 0; i < width * height; i++) {
        // Simple luminance calculation
        const r = imageData.data[i * 4];
        const g = imageData.data[i * 4 + 1];
        const b = imageData.data[i * 4 + 2];
        const brightness = (r + g + b) / 3 / 255;
        density[i] = 1 - brightness; // Darker areas have higher weight
    }

    startSimulation();
}

function startSimulation() {
    if (!width || !height) return; // No image loaded

    nPoints = parseInt(pointInput.value);
    statusDiv.textContent = `Processing ${width}x${height} image with ${nPoints} points...`;

    // Initialize points using rejection sampling for better starting distribution
    points = [];
    for (let i = 0; i < nPoints; i++) {
        let x, y, d;
        do {
            x = Math.random() * width;
            y = Math.random() * height;
            const idx = Math.floor(y) * width + Math.floor(x);
            d = density[idx];
        } while (Math.random() > d); // Keep point if random < density
        points.push([x, y]);
    }

    if (isRunning) cancelAnimationFrame(animationId);
    isRunning = true;
    animate();
}

// Handle slider change
pointInput.addEventListener('input', (e) => {
    pointValue.textContent = e.target.value;
    if (density.length > 0) {
        startSimulation();
    }
});

function animate() {
    if (!isRunning) return;

    // 1. Compute Voronoi Diagram
    // 1. Compute Voronoi Diagram
    const delaunay = Delaunay.from(points);
    // const voronoi = delaunay.voronoi([0, 0, width, height]); // Not strictly needed for centroid calc if using pixel iteration

    // 2. Compute Weighted Centroids
    // We iterate over all pixels and assign them to the nearest point (Voronoi cell)
    // calculating the weighted sum of coordinates.

    const newPoints = new Float64Array(nPoints * 2); // [sumX, sumY]
    const weights = new Float64Array(nPoints); // [sumWeights]

    // Optimization: d3-delaunay's find() is fast, especially with a starting hint.
    // We iterate pixel by pixel.
    let nextIndex = 0;

    // Iterate over pixels
    // To speed up, we can skip pixels (e.g. step=2), but quality might suffer slightly.
    // Let's try full resolution first.
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            const w = density[idx];

            if (w <= 0) continue; // Skip empty space

            // Find nearest point index
            // Using the previous pixel's index as a hint dramatically speeds up the search
            nextIndex = delaunay.find(x, y, nextIndex);

            newPoints[nextIndex * 2] += x * w;
            newPoints[nextIndex * 2 + 1] += y * w;
            weights[nextIndex] += w;
        }
    }

    // 3. Update point positions (Relaxation)
    let maxDistMoved = 0;
    for (let i = 0; i < nPoints; i++) {
        const w = weights[i];
        if (w > 0) {
            const nx = newPoints[i * 2] / w;
            const ny = newPoints[i * 2 + 1] / w;

            const dx = nx - points[i][0];
            const dy = ny - points[i][1];
            const dist = dx * dx + dy * dy;
            if (dist > maxDistMoved) maxDistMoved = dist;

            points[i][0] = nx;
            points[i][1] = ny;
        }
        // If w is 0, the point is stranded in a white area. 
        // We could respawn it, or just leave it. Leaving it is standard Lloyd's.
    }

    // 4. Draw
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#1e1e1e'; // Background matching CSS
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = 'white';
    ctx.beginPath();
    for (let i = 0; i < nPoints; i++) {
        const p = points[i];
        ctx.moveTo(p[0], p[1]);
        ctx.arc(p[0], p[1], 1.5, 0, 2 * Math.PI); // Small dots
    }
    ctx.fill();

    // Check convergence or just keep running?
    // Let's keep running for visual effect, but maybe slow down or stop if barely moving?
    // For now, infinite loop is mesmerizing.

    statusDiv.textContent = `Iterations running... Max motion: ${Math.sqrt(maxDistMoved).toFixed(2)}`;

    animationId = requestAnimationFrame(animate);
}

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Read the HTML file
const html = fs.readFileSync('index.html', 'utf8');

// Create directory for base64 images
const base64Dir = path.join(__dirname, 'public', 'base64-images');
if (!fs.existsSync(base64Dir)) {
  fs.mkdirSync(base64Dir, { recursive: true });
}

let modifiedHtml = fs.readFileSync('index.html', 'utf8');

// Find all base64 images using a simple approach - find all data:image/...;base64,...
// We'll do this by scanning for the pattern
const dataUrlRegex = /data:image\/([^;]+);base64,([^"']+)/g;

let modifiedHtml = fs.readFileSync('index.html', 'utf8');
let imageCount = 0;

// Find all data URLs
const dataUrls = [...modifiedHtml.matchAll(/data:image\/([^;]+);base64,([^"']+)/g)];

const uniqueDataUrls = [...new Set(dataUrls.map(m => m[0]))];

for (const dataUrl of uniqueDataUrls) {
  const match = dataUrl.match(/data:image\/([^;]+);base64,([^"']+)/);
  if (!match) continue;
  
  const mimeType = match[1];
  const base64Data = match[2];
  
  // Generate unique filename
  const hash = crypto.createHash('md5').update(base64Data).digest('hex').substring(0, 8);
  const ext = mimeType.split('/')[1] || 'png';
  const filename = `${hash}.${ext}`;
  
  // Save the base64 image to file
  const buffer = Buffer.from(base64Data, 'base64');
  const filePath = path.join(__dirname, 'public', 'base64-images', `${hash}.${ext}`);
  fs.writeFileSync(filePath, buffer);
  
  // Replace all occurrences of this data URL in the HTML
  const oldDataUrl = dataUrl;
  const newDataUrl = `/base64-images/${hash}.${ext}`;
  modifiedHtml = modifiedHtml.split(dataUrl).join(newDataUrl);
  
  console.log(`Replaced base64 image: ${hash}.${ext}`);
  imageCount++;
}

// Write the modified HTML back
fs.writeFileSync('index.html', modifiedHtml);
console.log(`Total ${imageCount} base64 images extracted and HTML updated`);
/**
 * Build script to produce a self-contained single HTML file.
 * 
 * Usage: node build-offline.mjs
 * Output: dist/sepa-xml-generator.html
 * 
 * This script:
 * 1. Runs the Vite build with vite-plugin-singlefile to inline JS/CSS
 * 2. Converts <script type="module"> to classic <script> (IIFE) for file:// compatibility
 * 3. Inlines the Google Fonts (latin subset) as base64
 * 4. Inlines the hero pattern image as base64 data URI
 * 5. Removes analytics/tracking scripts
 * 6. Produces a single portable HTML file that works from file:// protocol
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log("=== SEPA XML Generator — Offline Build ===\n");

// Step 1: Create a temporary vite config for the offline build
console.log("[1/6] Creating offline Vite config...");

// Use IIFE format to avoid ES module issues with file:// protocol
const offlineViteConfig = `
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/offline"),
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    rollupOptions: {
      output: {
        // Use IIFE format instead of ES modules for file:// compatibility
        format: "iife",
        inlineDynamicImports: true,
      },
    },
  },
});
`;

writeFileSync(resolve(__dirname, "vite.offline.config.ts"), offlineViteConfig);

// Step 2: Build with the offline config
console.log("[2/6] Running Vite build with IIFE format...");
try {
  execSync("npx vite build --config vite.offline.config.ts", {
    cwd: __dirname,
    stdio: "pipe",
  });
  console.log("  Build successful.");
} catch (e) {
  console.error("  Build failed:", e.stderr?.toString() || e.message);
  process.exit(1);
}

// Step 3: Read the built HTML
console.log("[3/6] Post-processing HTML...");
const htmlPath = resolve(__dirname, "dist/offline/index.html");
let html = readFileSync(htmlPath, "utf-8");

// Step 4: Convert <script type="module"> to classic <script> and move to end of body
// ES modules are deferred by default, but classic scripts execute immediately.
// When placed in <head>, the script runs before <div id="root"> exists, so React
// can't mount. Fix: extract the script from <head>, convert to classic, and place
// it at the end of <body> after the root div.
console.log("[4/6] Converting module scripts and moving to end of body...");

// Extract all inline script content from module scripts
const scriptContents = [];
html = html.replace(/<script\s+type="module"[^>]*>(.*?)<\/script>/gs, (match, content) => {
  if (content.trim()) {
    scriptContents.push(content);
  }
  return ''; // Remove from original position
});

// Also handle any already-converted classic scripts with content in head
html = html.replace(/<script\s+crossorigin>(.*?)<\/script>/gs, (match, content) => {
  if (content.trim()) {
    scriptContents.push(content);
  }
  return '';
});

// Place all scripts at the end of body, after the root div
if (scriptContents.length > 0) {
  const allScripts = scriptContents.map(s => `<script>${s}</script>`).join('\n');
  html = html.replace('</body>', `${allScripts}\n</body>`);
  console.log(`  Moved ${scriptContents.length} script(s) to end of body.`);
} else {
  console.log("  Warning: No inline scripts found to move.");
}

// Step 5: Inline fonts
console.log("[5/6] Inlining fonts...");
const fontsPath = resolve(__dirname, "client/src/assets/fonts/fonts-inline.css");
if (existsSync(fontsPath)) {
  const fontsCss = readFileSync(fontsPath, "utf-8");
  // Replace Google Fonts links with inline style
  html = html.replace(
    /<link[^>]*fonts\.googleapis\.com[^>]*>/g,
    ""
  );
  html = html.replace(
    /<link[^>]*fonts\.gstatic\.com[^>]*>/g,
    ""
  );
  // Insert font CSS into head
  html = html.replace("</head>", `<style>${fontsCss}</style>\n</head>`);
  console.log(`  Inlined ${(fontsCss.length / 1024).toFixed(0)}KB of font data.`);
} else {
  console.log("  Warning: fonts-inline.css not found, fonts will require internet.");
}

// Step 6: Inline hero image
console.log("[6/6] Inlining hero image...");
const heroImagePath = "/tmp/hero-pattern.webp";
if (existsSync(heroImagePath)) {
  const heroB64 = readFileSync(heroImagePath).toString("base64");
  const heroDataUri = `data:image/webp;base64,${heroB64}`;
  html = html.replace(
    /https:\/\/d2xsxph8kpxj0f\.cloudfront\.net\/[^"')]+hero-pattern[^"')]+/g,
    heroDataUri
  );
  console.log(`  Inlined hero image (${(heroB64.length / 1024).toFixed(0)}KB).`);
}

// Remove analytics script
html = html.replace(
  /<script[^>]*umami[^>]*><\/script>/g,
  ""
);
html = html.replace(
  /<script[^>]*VITE_ANALYTICS[^>]*><\/script>/g,
  ""
);

// Remove any remaining preconnect hints to external domains
html = html.replace(/<link[^>]*preconnect[^>]*>/g, "");

// Add offline indicator and meta tag for file:// compatibility
html = html.replace(
  "<head>",
  `<head>
<!-- SEPA XML Generator — Offline Portable Version -->
<!-- Generated: ${new Date().toISOString()} -->
<!-- This file works when opened directly from the filesystem (file:// protocol) -->`
);

// Write final output
const outputDir = resolve(__dirname, "dist");
if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
const outputPath = resolve(outputDir, "sepa-xml-generator.html");
writeFileSync(outputPath, html);

const sizeKB = (Buffer.byteLength(html) / 1024).toFixed(0);
const sizeMB = (Buffer.byteLength(html) / 1024 / 1024).toFixed(2);

console.log(`\n✓ Offline build complete!`);
console.log(`  Output: dist/sepa-xml-generator.html`);
console.log(`  Size:   ${sizeKB}KB (${sizeMB}MB)`);
console.log(`\nTo use: Open sepa-xml-generator.html directly in Chrome, Edge, or Firefox.`);
console.log(`Works from file:// protocol — no server needed.`);

// Cleanup temp config
try {
  unlinkSync(resolve(__dirname, "vite.offline.config.ts"));
} catch {}

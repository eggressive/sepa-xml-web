/**
 * Build script to produce a self-contained single HTML file.
 * 
 * Usage: node build-offline.mjs
 * Output: dist/sepa-xml-generator.html
 * 
 * This script:
 * 1. Runs the Vite build with vite-plugin-singlefile to inline JS/CSS
 * 2. Inlines the Google Fonts (latin subset) as base64
 * 3. Inlines the hero pattern image as base64 data URI
 * 4. Removes analytics/tracking scripts
 * 5. Produces a single portable HTML file
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log("=== SEPA XML Generator — Offline Build ===\n");

// Step 1: Create a temporary vite config for the offline build
console.log("[1/5] Creating offline Vite config...");

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
    assetsInlineLimit: 100000000, // Inline everything
  },
});
`;

writeFileSync(resolve(__dirname, "vite.offline.config.ts"), offlineViteConfig);

// Step 2: Build with the offline config
console.log("[2/5] Running Vite build with singlefile plugin...");
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
console.log("[3/5] Post-processing HTML...");
const htmlPath = resolve(__dirname, "dist/offline/index.html");
let html = readFileSync(htmlPath, "utf-8");

// Step 4: Inline fonts
console.log("[4/5] Inlining fonts...");
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

// Step 5: Inline hero image
console.log("[5/5] Inlining hero image...");
const heroImagePath = "/tmp/hero-pattern.webp";
if (existsSync(heroImagePath)) {
  const heroB64 = readFileSync(heroImagePath).toString("base64");
  const heroDataUri = `data:image/webp;base64,${heroB64}`;
  // Replace the CDN URL with the data URI
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

// Add offline indicator comment
html = html.replace(
  "<head>",
  `<head>\n<!-- SEPA XML Generator — Offline Portable Version -->\n<!-- Generated: ${new Date().toISOString()} -->`
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
console.log(`\nTo use: Open sepa-xml-generator.html in any modern browser.`);

// Cleanup temp config
import("fs").then((fs) => {
  try {
    fs.unlinkSync(resolve(__dirname, "vite.offline.config.ts"));
  } catch {}
});

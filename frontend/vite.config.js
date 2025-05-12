import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
	plugins: [
		react(),
		nodePolyfills()
	],
	server: {
		// Add this section
		port: 3000,
		strictPort: true, // Optional: Makes Vite exit if the port is already in use
	},
	build: {
		rollupOptions: {
			input: "index.html",
			output: {
				dir: "dist",
				entryFileNames: "[name].js",
				chunkFileNames: "[name].js",
				assetFileNames: "[name].[ext]",
			},
		},
		commonjsOptions: {
			transformMixedEsModules: true,
		},
	},
	resolve: {
		alias: {
			path: "path-browserify",
			stream: "stream-browserify",
			util: "util/",
			"node:path": "path-browserify",
			"node:fs": false,
			"node:process": "process/browser",
		},
	},
});

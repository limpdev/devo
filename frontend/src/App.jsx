// frontend/src/App.jsx
import { useState, useEffect, useCallback } from "react";
import * as runtime from "../wailsjs/runtime/runtime";
import { Icon } from "@iconify/react";
// Import markdown-it instead of remark
import MarkdownIt from "markdown-it";
import markdownItAnchor from "markdown-it-anchor";
import markdownItHighlight from "markdown-it-highlightjs";
import { container } from "@mdit/plugin-container";
import { katex } from "@mdit/plugin-katex";
import { mark } from "@mdit/plugin-mark";
import { sub } from "@mdit/plugin-sub";
import { sup } from "@mdit/plugin-sup";
import { tab } from "@mdit/plugin-tab";
// Import Go functions
import { GetBookData, GetMarkdownContent } from "../wailsjs/go/main/App";
import { BrowserOpenURL } from "../wailsjs/runtime/runtime";

import TableOfContents from "./components/TableOfContents";
import "./App.css";

// --- Custom JS Logic (Integrated) ---

// CONVERTS GITHUB-STYLE CALLOUTS TO HTML
function convertMarkdownCallouts(htmlText) {
	if (!htmlText) return "";
	const calloutTypes = {
		NOTE: '<i class="note-icon">󱞁</i>', // Using appropriate icons or text
		TIP: '<i class="tip-icon">󰴓</i>',
		IMPORTANT: '<i class="important-icon">󱁯</i>',
		WARNING: '<i class="warning-icon">󰉀</i>',
		CAUTION: '<i class="caution-icon"></i>',
		HINT: '<i class="hint-icon">󰴓</i>',
	};
	const calloutRegex = /\<blockquote\>\s*<p>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|HINT)\]\s*([\s\S]*?)<\/p>\s*\<\/blockquote\>/gm
	return htmlText.replace(calloutRegex, function (match, type, content) {
		const normalizedType = type.toUpperCase();
		const calloutType = Object.keys(calloutTypes).includes(normalizedType) ? normalizedType : "NOTE";
		const processedContent = content.trim(); // Basic trim, React would handle complex tags better if it rendered them

		// Ensure <p> tags wrap content if not already present (markdown-it might add them)
		const finalContent = processedContent.startsWith("<p>") ? processedContent : `<p>${processedContent}</p>`;

		return `<div class="callout callout-${calloutType.toLowerCase()}">
      <div class="callout-header">
        <span class="callout-icon">${calloutTypes[calloutType]}</span>
        <span class="callout-title">${calloutType}</span>
      </div>
      <div class="callout-content">
        ${finalContent}
      </div>
    </div>`;
	});
}

// MARK TAGS FOR TEXT - AKA, Highlighting!
function addMarkTags(text) {
	if (!text) return "";
	const markRegex = /==(.*?)==/g;
	return text.replace(markRegex, `<mark>$1</mark>`);
}

// Logic for handling clicks on dynamically added copy buttons
function setupCopyButtonListeners(containerElement) {
	if (!containerElement) return []; // Return empty array if no container

	const buttons = containerElement.querySelectorAll("pre code.hljs + .clip-button, pre code + .clip-button"); // Be more specific if highlightjs adds button differently
	const listeners = [];

	buttons.forEach((button) => {
		const pre = button.closest("pre");
		const codeBlock = pre ? pre.querySelector("code") : null;

		if (!codeBlock) return; // Skip if structure isn't as expected

		const clickHandler = async () => {
			try {
				await navigator.clipboard.writeText(codeBlock.innerText);

				// --- Visual Feedback ---
				const svg = button.querySelector("svg");
				if (!svg) return; // Skip if no SVG

				// Save original state
				const originalViewBox = svg.getAttribute("viewBox");
				const originalWidth = svg.getAttribute("width");
				const originalHeight = svg.getAttribute("height");
				const originalFill = svg.getAttribute("fill"); // May be null
				const originalHtml = svg.innerHTML;
				const originalAriaLabel = button.getAttribute("aria-label");

				// Apply success state
				svg.innerHTML = ""; // Clear existing paths/etc.
				svg.setAttribute("viewBox", "0 0 24 24");
				// Ensure consistent size, might need adjustment based on original CSS/size
				// svg.setAttribute("width", "1.5em");
				// svg.setAttribute("height", "1.5em");
				svg.setAttribute("fill", "var(--hl-green, green)"); // Use CSS variable or fallback

				const successPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
				successPath.setAttribute(
					"d",
					"M9.5 18.5l-5.5-5.5l1.41-1.41l4.09 4.09l8.59-8.59l1.41 1.41L9.5 18.5z", // Simple checkmark
				);
				svg.appendChild(successPath);
				button.setAttribute("aria-label", "Copied!");
				button.classList.add("copied"); // Add class for potential styling

				// Reset after 2 seconds
				setTimeout(() => {
					svg.innerHTML = originalHtml; // Restore original content
					svg.setAttribute("viewBox", originalViewBox);
					svg.setAttribute("width", originalWidth);
					svg.setAttribute("height", originalHeight);
					if (originalFill) svg.setAttribute("fill", originalFill);
					else svg.removeAttribute("fill");
					button.setAttribute("aria-label", originalAriaLabel || "Copy to clipboard");
					button.classList.remove("copied"); // Remove class
				}, 2000);
			} catch (err) {
				console.error("Failed to copy code:", err);
				button.setAttribute("aria-label", "Copy failed!");
				// Optionally provide visual feedback for error
			}
		};

		button.addEventListener("click", clickHandler);
		// Store the button and handler for cleanup
		listeners.push({ element: button, type: "click", handler: clickHandler });
	});

	return listeners; // Return the array of added listeners
}

// Logic for creating ripple effect on click
function handleGlobalClickForRipple(e) {
	// Ignore clicks on buttons or interactive elements if desired
	if (e.target.closest("button, a, input, select, textarea")) {
		return;
	}

	const rippleContainer = document.createElement("div");
	rippleContainer.style.position = "fixed";
	rippleContainer.style.left = e.clientX - 48 + "px"; // Center 96x96 svg
	rippleContainer.style.top = e.clientY - 48 + "px";
	rippleContainer.style.pointerEvents = "none";
	rippleContainer.style.zIndex = "9999";
	rippleContainer.style.width = "96px";
	rippleContainer.style.height = "96px";
	rippleContainer.style.overflow = "hidden"; // Contain ripple if needed

	const svgNS = "http://www.w3.org/2000/svg";
	const svg = document.createElementNS(svgNS, "svg");
	svg.setAttribute("width", "96");
	svg.setAttribute("height", "96");
	svg.setAttribute("viewBox", "0 0 24 24");

	const circle = document.createElementNS(svgNS, "circle");
	circle.setAttribute("cx", "12");
	circle.setAttribute("cy", "12");
	circle.setAttribute("r", "0");
	// Use a CSS variable or a default color for the ripple
	circle.setAttribute("fill", "var(--ripple-color, rgba(168, 168, 168, 0.7))");
	circle.style.opacity = "1"; // Start fully opaque

	// Use CSS animations instead of SMIL for better compatibility & control
	circle.style.animation = "ripple-radius 0.5s cubic-bezier(.52,.6,.25,.99) forwards, ripple-opacity 0.5s linear 0.1s forwards"; // Delay opacity fade slightly

	svg.appendChild(circle);
	rippleContainer.appendChild(svg);
	document.body.appendChild(rippleContainer);

	// Remove after animation completes (adjust time if animation duration changes)
	setTimeout(() => {
		if (document.body.contains(rippleContainer)) {
			document.body.removeChild(rippleContainer);
		}
	}, 600); // A bit longer than animation duration
}

// Define the CSS animations (add this to your App.css or index.css)
// @keyframes ripple-radius { 
//  to { r: 12; } // Animate radius to fill the 24x24 viewbox
// }
// @keyframes ripple-opacity {
//   to { opacity: 0; }
// }
// END OF CUSTOM LOGIC

// --- REACT COMPONENT ---
// Initialize markdown-it with plugins
const md = new MarkdownIt({
	html: true,
	linkify: true,
	typographer: true,
})
	.use(markdownItAnchor, {
		permalink: true,
		permalinkSymbol: " 󰓼",
		permalinkSpace: false,
	})
	.use(markdownItHighlight)
	.use(katex)
	.use(mark)
	.use(sub)
	.use(sup)
	.use(tab, {
		name: "tab",
		tabRender: (tokens, index, _options) => {
			const token = tokens[index];
			if (token.nesting === 1) {
				return `<nav class="tab-inline"><p class="tab-title">${token.info}</p>\n`;
			} else {
				return `</div>\n`;
			}
		}
	})
	.use(container, { name: "warning",
		openRender: (tokens, index, _options) => {
      const token = tokens[index];
      if (token.nesting === 1) {
        return `<div class="custom-block warning"><p class="custom-block-title">⚠️ Warning</p>\n`;
      } else {
        return `</div>\n`;
	  }}
	})
	.use(container, { name: "caution",
		openRender: (tokens, index, _options) => {
      const token = tokens[index];
      if (token.nesting === 1) {
        return `<div class="custom-block caution"><p class="custom-block-title">🛑 Caution</p>\n`;
      } else {
        return `</div>\n`;
	  }}
	})
	.use(container, { name: "tip",
		openRender: (tokens, index, _options) => {
      const token = tokens[index];
      if (token.nesting === 1) {
        return `<div class="custom-block tip"><p class="custom-block-title"> Tip</p>\n`;
      } else {
        return `</div>\n`;
	  }}
	})
	.use(container, { name: "note",
		openRender: (tokens, index, _options) => {
      const token = tokens[index];
      if (token.nesting === 1) {
        return `<div class="custom-block note"><p class="custom-block-title"> Note</p>\n`;
      } else {
        return `</div>\n`;
	  }}
	})
	.use(container, { name: "hint",
		openRender: (tokens, index, _options) => {
      const token = tokens[index];
      if (token.nesting === 1) {
        return `<div class="custom-block hint"><p class="custom-block-title"> Hint</p>\n`;
      } else {
        return `</div>\n`;
	  }}
	})
	.use(container, { name: "important",
		openRender: (tokens, index, _options) => {
      const token = tokens[index];
      if (token.nesting === 1) {
        return `<div class="custom-block important"><p class="custom-block-title"> Important</p>\n`;
      } else {
        return `</div>\n`;
	  }}
	});

function App() {
	const [toc, setToc] = useState([]);
	const [currentMarkdown, setCurrentMarkdown] = useState("");
	const [currentHtml, setCurrentHtml] = useState(""); // Store processed HTML
	const [currentPath, setCurrentPath] = useState(""); // Relative path of the current .md file
	const [isLoadingContent, setIsLoadingContent] = useState(true); // For content area
	const [initialLoadError, setInitialLoadError] = useState(null); // For errors during GetBookData

	// --- Window Controls ---
	const handleMinimize = () => runtime.WindowMinimise();
	const handleClose = () => runtime.Quit();

	// Process markdown to HTML whenever markdown content changes
	useEffect(() => {
		if (!currentMarkdown) return;

		try {
			// Use markdown-it to convert markdown to HTML
			const htmlContent = md.render(currentMarkdown);
			setCurrentHtml(htmlContent);
		} catch (error) {
			console.error("Error processing markdown:", error);
			setCurrentHtml(`<div class="error">Failed to process markdown: ${error.message}</div>`);
		}
	}, [currentMarkdown]);

	// --- Book Loading Logic ---
	useEffect(() => {
		const fetchInitialBookData = async () => {
			setIsLoadingContent(true);
			setInitialLoadError(null);
			try {
				console.log("Fetching initial book data...");
				const bookData = await GetBookData();
				if (bookData.error) {
					console.error("Error from GetBookData:", bookData.error);
					setInitialLoadError(bookData.error);
					// Still set TOC if available, markdown might be an error message from Go
					setToc(bookData.toc || []);
					setCurrentMarkdown(bookData.initialMarkdown || `# Error\n\n${bookData.error}`);
					setCurrentPath(bookData.initialPath || "");
				} else {
					setToc(bookData.toc);
					setCurrentMarkdown(bookData.initialMarkdown);
					setCurrentPath(bookData.initialPath);
				}
			} catch (err) {
				console.error("Critical error fetching book data:", err);
				const errorMsg = err.message || "Failed to load book structure from backend.";
				setInitialLoadError(errorMsg);
				setCurrentMarkdown(`# Critical Error\n\n${errorMsg}`);
			} finally {
				setIsLoadingContent(false);
			}
		};
		fetchInitialBookData();
	}, []);

	const loadChapter = useCallback(
		async (relativePath) => {
			if (!relativePath || !relativePath.toLowerCase().endsWith(".md")) {
				console.warn("Attempted to load non-markdown file as chapter:", relativePath);
				return;
			}
			if (relativePath === currentPath && currentMarkdown) {
				// Avoid reloading same content
				console.log("Chapter already loaded:", relativePath);
				return;
			}
			setIsLoadingContent(true);
			try {
				console.log(`Fetching markdown for: ${relativePath}`);
				const mdContent = await GetMarkdownContent(relativePath);
				setCurrentMarkdown(mdContent);
				setCurrentPath(relativePath);
				// Scroll content to top
				const contentArea = document.querySelector(".content-view-wrapper");
				if (contentArea) contentArea.scrollTop = 0;
			} catch (err) {
				console.error(`Error fetching markdown for ${relativePath}:`, err);
				setCurrentMarkdown(`# Error loading content\n\nCould not load: \`${relativePath}\`\n\n${err.message}`);
				// Optionally set currentPath to an error state or keep previous
			} finally {
				setIsLoadingContent(false);
			}
		},
		[currentPath, currentMarkdown],
	); // Add dependencies for useCallback

	// Handle link clicks within the processed HTML
	const handleLinkClick = useCallback(
		(event) => {
			// Only handle clicks on links
			if (event.target.tagName !== "A") return;
			const href = event.target.getAttribute("href");
			if (!href) return;
			// Handle internal markdown links
			if (href.endsWith(".md") || (!href.startsWith("http") && !href.startsWith("#") && !href.startsWith("/"))) {
				event.preventDefault();
				let targetPath = href;
				// Basic relative path resolution from current chapter's directory
				if (!href.startsWith("/") && currentPath && !href.toLowerCase().startsWith("http")) {
					const currentDir = currentPath.substring(0, currentPath.lastIndexOf("/") + 1); // includes trailing slash
					if (currentDir && !href.startsWith("../") && !href.startsWith("./")) {
						targetPath = `${currentDir}${href}`;
					} else {
						// More complex relative path (e.g. ../file.md or ./file.md)
						const combinedPath = currentDir + href;
						const parts = combinedPath.split("/");
						const newParts = [];
						for (const part of parts) {
							if (part === "." || part === "") continue;
							if (part === "..") {
								if (newParts.length > 0) newParts.pop();
							} else newParts.push(part);
						}
						targetPath = newParts.join("/");
					}
				}
				console.log(`Internal link clicked: ${href}, resolved to: ${targetPath}`);
				loadChapter(targetPath);
			}
			// Handle external links
			else if (href.startsWith("http")) {
				event.preventDefault();
				BrowserOpenURL(href);
			}
			// Let browser handle anchor links within the page
		},
		[currentPath, loadChapter],
	);

	// Add event listener for link clicks
	useEffect(() => {
		const contentArea = document.querySelector(".content-view-wrapper");
		if (contentArea) {
			contentArea.addEventListener("click", handleLinkClick);
			return () => contentArea.removeEventListener("click", handleLinkClick);
		}
	}, [handleLinkClick]);

	// Handle images in the HTML content
	const processImages = useCallback(
		(htmlContent) => {
			if (!htmlContent) return htmlContent;
			// Create a temporary DOM element to parse and modify the HTML
			const tempDiv = document.createElement("div");
			tempDiv.innerHTML = htmlContent;
			// Process all images
			const images = tempDiv.querySelectorAll("img");
			images.forEach((img) => {
				let src = img.getAttribute("src");
				if (!src) return;
				if (!src.startsWith("http") && !src.startsWith("/")) {
					// Relative image path
					let base = "";
					const lastSlash = currentPath.lastIndexOf("/");
					if (lastSlash !== -1) {
						base = currentPath.substring(0, lastSlash); // "folder"
					}
					let newSrc = base ? `${base}/${src}` : src;
					const parts = newSrc.split("/");
					const resolved = [];
					for (const part of parts) {
						if (part === "." || part === "") continue;
						if (part === "..") {
							if (resolved.length > 0) resolved.pop();
						} else {
							resolved.push(part);
						}
					}
					// All assets from book/src are served under /bookcontent/ by AssetServer
					src = `/frontend/dist/${resolved.join("/")}`;
					img.setAttribute("src", src);
				} else if (src.startsWith("/")) {
					// Path is absolute from web root
					src = `/frontend/dist${src}`;
					img.setAttribute("src", src);
				}
			});
			return tempDiv.innerHTML;
		},
		[currentPath],
	);

	// --- CUSTOM: Process Markdown -> HTML -> Apply Customizations -> Render ---
	useEffect(() => {
		const contentEl = document.querySelector(".markdown-content");
		if (!contentEl) return; // Ensure target element exists
		if (!currentMarkdown) {
			contentEl.innerHTML = ""; // Clear content if markdown is empty
			return;
		}
		try {
			// 1. Render Markdown to HTML
			let htmlContent = md.render(currentMarkdown);
			// 2. Process image paths (needs currentPath)
			htmlContent = processImages(htmlContent);
			// 3. Apply custom HTML transformations (Callouts, Marks)
			htmlContent = convertMarkdownCallouts(htmlContent);
			htmlContent = addMarkTags(htmlContent);
			// 4. Set the final HTML
			contentEl.innerHTML = htmlContent;
			// Note: Copy button listeners are handled in a separate effect below
		} catch (error) {
			console.error("Error processing markdown or applying customisations:", error);
			contentEl.innerHTML = `<div class="error">Failed to render content: ${error.message}</div>`;
		}
	}, [currentMarkdown, processImages]); // Rerun when markdown changes or image processing logic changes (due to currentPath)

	// --- Effect for setting up Copy Button Listeners ---
	useEffect(() => {
		const contentEl = document.querySelector(".markdown-content");
		if (!contentEl) return;
		// Setup listeners and get the list of added listeners
		const addedListeners = setupCopyButtonListeners(contentEl);
		// Cleanup function: Remove all listeners added by this effect instance
		return () => {
			addedListeners.forEach(({ element, type, handler }) => {
				element.removeEventListener(type, handler);
			});
		};
	}, [currentMarkdown]); // Rerun when markdown content changes (which implies HTML changed)

	// --- Effect for Global Ripple Effect ---
	useEffect(() => {
		// Add the global click listener
		document.addEventListener("click", handleGlobalClickForRipple);
		// Cleanup function: Remove the global listener when App unmounts
		return () => {
			document.removeEventListener("click", handleGlobalClickForRipple);
		};
	}, []); // Empty dependency array: Runs once on mount, cleans up on unmount

	// Process HTML whenever it changes
	useEffect(() => {
		if (!currentHtml) return;

		const processedHtml = processImages(currentHtml);
		// We're setting the HTML directly instead of using ReactMarkdown
		const contentEl = document.querySelector(".markdown-content");
		if (contentEl) {
			contentEl.innerHTML = processedHtml;
		}
	}, [currentHtml, processImages]);

	return (
		<div id="app-container">
			<div className="title-bar" style={{ "--wails-draggable": "drag" }}>
				<div className="title-bar-text">   </div>
				<div className="window-controls">
					<button onClick={handleMinimize} className="window-button minimize" aria-label="Minimize">
						<Icon icon="solar:minimize-square-3-line-duotone" width="11" height="11" style={{ color: "#ffffff40" }} />
					</button>
					<button onClick={handleClose} className="window-button close" aria-label="Close">
						<Icon icon="icon-park-twotone:close-one" width="11" height="11" style={{ color: "#ffffff40" }} />
					</button>
				</div>
			</div>

			<div className="main-layout hide-scrollbar scrollbar-none">
				<TableOfContents tocItems={toc} onItemClick={loadChapter} currentPath={currentPath} />

				<div className="content-view-wrapper hide-scrollbar">
					{" "}
					{/* Wrapper for scrolling */}
					{initialLoadError && (
						<div className="error-indicator global-error">
							<h3>Failed to Load Book</h3>
							<pre>{initialLoadError}</pre>
						</div>
					)}
					{isLoadingContent && <div className="loading-indicator content-loading"> Loading Content...</div>}
					{!isLoadingContent && (
						// Add 'markdown-body' class if using github-markdown-css
						<div className="markdown-content hide-scrollbar">{/* The HTML will be directly inserted into this div through useEffect */}</div>
					)}
				</div>
			</div>
		</div>
	);
}

export default App;

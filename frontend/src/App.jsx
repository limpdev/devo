// frontend/src/App.jsx
import { useState, useEffect, useCallback, useRef } from "react"; // Added useRef
import * as runtime from "../wailsjs/runtime/runtime";
import { Icon } from "@iconify/react";
import MarkdownIt from "markdown-it";
import markdownItAnchor from "markdown-it-anchor";
import markdownItHighlight from "markdown-it-highlightjs";
// ... (keep other markdown-it plugins)
import { container } from "@mdit/plugin-container";
import { katex } from "@mdit/plugin-katex";
import { mark } from "@mdit/plugin-mark";
import { sub } from "@mdit/plugin-sub";
import { sup } from "@mdit/plugin-sup";
import { tab } from "@mdit/plugin-tab";
import { align } from "@mdit/plugin-align";
import { spoiler } from "@mdit/plugin-spoiler";

import { GetBookData, GetMarkdownContent, OpenFolder } from "../wailsjs/go/main/App"; // OpenFolder was already imported
import { BrowserOpenURL } from "../wailsjs/runtime/runtime";

import TableOfContents from "./components/TableOfContents";
import "./App.css";

// --- Custom JS Logic (Integrated) ---

function addCopyButtonsToCodeBlocks(containerElement) {
	if (!containerElement) return;
	const preElements = containerElement.querySelectorAll("pre");

	preElements.forEach((preEl) => {
		if (preEl.parentElement && preEl.parentElement.classList.contains("code-wrapper")) {
			return;
		}
		const codeEl = preEl.querySelector("code");
		if (!codeEl) return;

		const wrapperDiv = document.createElement("div");
		wrapperDiv.className = "code-wrapper";
		const copyButton = document.createElement("button");
		copyButton.className = "clip-button";
		copyButton.setAttribute("aria-label", "Copy to clipboard");
		copyButton.setAttribute("title", "Copy to clipboard");

		// CORRECTED Clipboard Icon SVG
		copyButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
            </svg>
        `;
		preEl.parentNode.insertBefore(wrapperDiv, preEl);
		wrapperDiv.appendChild(copyButton);
		wrapperDiv.appendChild(preEl);

		const language = codeEl.className.match(/language-(\w+)/);
		if (language && language[1]) {
			const langLabel = document.createElement("span");
			langLabel.className = "language-label";
			langLabel.textContent = language[1];
			wrapperDiv.insertBefore(langLabel, preEl);
		}
	});
}

function setupCopyButtonListeners(containerElement) {
	if (!containerElement) return [];
	const buttons = containerElement.querySelectorAll(".code-wrapper .clip-button");
	const listeners = [];

	buttons.forEach((button) => {
		const wrapper = button.closest(".code-wrapper");
		const pre = wrapper ? wrapper.querySelector("pre") : null;
		const codeBlock = pre ? pre.querySelector("code") : null;
		if (!codeBlock) return;

		// Check if listener already attached to avoid duplicates if this function is called multiple times
		// on the same buttons (though the combined useEffect should manage this better)
		if (button.dataset.copyListenerAttached === "true") return;
		button.dataset.copyListenerAttached = "true";

		const clickHandler = async () => {
			try {
				await navigator.clipboard.writeText(codeBlock.innerText);
				const svg = button.querySelector("svg");
				if (!svg) return;
				const originalViewBox = svg.getAttribute("viewBox");
				const originalWidth = svg.getAttribute("width");
				const originalHeight = svg.getAttribute("height");
				const originalFill = svg.getAttribute("fill");
				const originalHtml = svg.innerHTML;
				const originalAriaLabel = button.getAttribute("aria-label");
				const originalTitle = button.getAttribute("title");

				svg.innerHTML = "";
				svg.setAttribute("viewBox", "0 0 24 24");
				svg.setAttribute("fill", "var(--hl-green, green)");
				const successPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
				successPath.setAttribute(
					"d",
					"M10 2a3 3 0 0 0-2.83 2H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3h-1.17A3 3 0 0 0 14 2zM9 5a1 1 0 0 1 1-1h4a1 1 0 1 1 0 2h-4a1 1 0 0 1-1-1m6.78 6.625a1 1 0 1 0-1.56-1.25l-3.303 4.128l-1.21-1.21a1 1 0 0 0-1.414 1.414l2 2a1 1 0 0 0 1.488-.082l4-5z",
				);
				svg.appendChild(successPath);
				button.setAttribute("aria-label", "Copied!");
				button.setAttribute("title", "Copied!");
				button.classList.add("copied");

				setTimeout(() => {
					svg.innerHTML = originalHtml;
					if (originalViewBox) svg.setAttribute("viewBox", originalViewBox);
					else svg.removeAttribute("viewBox");
					if (originalWidth) svg.setAttribute("width", originalWidth);
					else svg.removeAttribute("width");
					if (originalHeight) svg.setAttribute("height", originalHeight);
					else svg.removeAttribute("height");
					if (originalFill) svg.setAttribute("fill", originalFill);
					else svg.removeAttribute("fill");
					button.setAttribute("aria-label", originalAriaLabel || "Copy to clipboard");
					button.setAttribute("title", originalTitle || "Copy to clipboard");
					button.classList.remove("copied");
				}, 2000);
			} catch (err) {
				console.error("Failed to copy code:", err);
				// Handle error state briefly
			}
		};
		button.addEventListener("click", clickHandler);
		listeners.push({ element: button, type: "click", handler: clickHandler, id: "copyButton" });
		// Add a custom cleanup for the dataset attribute
		listeners.push({
			element: button, // Not strictly an event listener, but a cleanup action
			type: "cleanup-copy-listener-attached",
			handler: () => {
				if (button) button.removeAttribute("data-copy-listener-attached");
			},
		});
	});
	return listeners;
}

function handleGlobalClickForRipple(e) {
	// ... (keep existing ripple logic, it's independent and seems fine)
	if (e.target.closest("button, a, input, select, textarea")) {
		return;
	}
	const rippleContainer = document.createElement("div");
	rippleContainer.style.position = "fixed";
	rippleContainer.style.left = e.clientX - 48 + "px";
	rippleContainer.style.top = e.clientY - 48 + "px";
	rippleContainer.style.pointerEvents = "none";
	rippleContainer.style.zIndex = "9999";
	rippleContainer.style.width = "96px";
	rippleContainer.style.height = "96px";
	rippleContainer.style.overflow = "hidden";
	const svgNS = "http://www.w3.org/2000/svg";
	const svg = document.createElementNS(svgNS, "svg");
	svg.setAttribute("width", "96");
	svg.setAttribute("height", "96");
	svg.setAttribute("viewBox", "0 0 24 24");
	const circle = document.createElementNS(svgNS, "circle");
	circle.setAttribute("cx", "12");
	circle.setAttribute("cy", "12");
	circle.setAttribute("r", "0");
	circle.setAttribute("fill", "var(--ripple-color, rgba(168, 168, 168, 0.7))");
	circle.style.opacity = "0.7";
	const animateRadius = document.createElementNS(svgNS, "animate");
	animateRadius.setAttribute("attributeName", "r");
	animateRadius.setAttribute("calcMode", "spline");
	animateRadius.setAttribute("dur", "0.4s");
	animateRadius.setAttribute("keySplines", ".52,.6,.25,.99");
	animateRadius.setAttribute("values", "0;11");
	animateRadius.setAttribute("fill", "freeze");
	const animateOpacity = document.createElementNS(svgNS, "animate");
	animateOpacity.setAttribute("attributeName", "opacity");
	animateOpacity.setAttribute("calcMode", "spline");
	animateOpacity.setAttribute("dur", "0.4s");
	animateOpacity.setAttribute("keySplines", ".52,.6,.25,.99");
	animateOpacity.setAttribute("values", "1;0");
	animateOpacity.setAttribute("fill", "freeze");
	circle.appendChild(animateRadius);
	circle.appendChild(animateOpacity);
	svg.appendChild(circle);
	rippleContainer.appendChild(svg);
	document.body.appendChild(rippleContainer);
	setTimeout(() => {
		if (document.body.contains(rippleContainer)) {
			document.body.removeChild(rippleContainer);
		}
	}, 600);
}

// REFACTORED makeDetails function
function makeDetails(containerElement) {
	if (!containerElement) return [];

	const detailsElements = containerElement.querySelectorAll("details");
	const allAddedListeners = [];

	detailsElements.forEach((details) => {
		const summary = details.querySelector("summary");
		if (!summary) return;

		if (details.dataset.detailsProcessed === "true") {
			return; // Already processed
		}
		details.dataset.detailsProcessed = "true";

		let contentWrapper = details.querySelector(".details-content");
		if (!contentWrapper) {
			contentWrapper = document.createElement("div");
			contentWrapper.className = "details-content";
			// Move nodes after summary into wrapper
			const nodesToMove = [];
			let sibling = summary.nextSibling;
			while (sibling) {
				nodesToMove.push(sibling);
				sibling = sibling.nextSibling;
			}
			nodesToMove.forEach((node) => contentWrapper.appendChild(node));
			details.appendChild(contentWrapper);
		}

		contentWrapper.style.overflow = "hidden";
		contentWrapper.style.transition = "height 0.3s ease-in-out";

		const setInitialHeight = () => {
			if (!details.open) {
				contentWrapper.style.height = "0px";
			} else {
				contentWrapper.style.height = "auto"; // Measure
				const scrollHeight = contentWrapper.scrollHeight + "px";
				contentWrapper.style.height = scrollHeight; // Set for animation
			}
		};
		setInitialHeight(); // Call immediately

		const clickHandler = (e) => {
			e.preventDefault();
			details.classList.toggle("is-animating"); // For potential styling

			if (details.open) {
				// Closing
				contentWrapper.style.height = contentWrapper.scrollHeight + "px";
				requestAnimationFrame(() => {
					contentWrapper.style.height = "0px";
				});
				// `open` attribute will be removed by transitionend
			} else {
				// Opening
				details.open = true; // Set open so it's visible for scrollHeight measurement
				contentWrapper.style.height = "0px"; // Start from 0
				requestAnimationFrame(() => {
					contentWrapper.style.height = contentWrapper.scrollHeight + "px";
				});
			}
		};

		summary.addEventListener("click", clickHandler);
		allAddedListeners.push({ element: summary, type: "click", handler: clickHandler, id: `details_click_${summary.textContent.slice(0, 10)}` });

		const transitionEndHandler = () => {
			details.classList.remove("is-animating");
			if (contentWrapper.style.height === "0px") {
				// Finished closing
				details.open = false;
			} else {
				// Finished opening
				contentWrapper.style.height = "auto"; // Allow content to reflow
			}
		};
		contentWrapper.addEventListener("transitionend", transitionEndHandler);
		allAddedListeners.push({ element: contentWrapper, type: "transitionend", handler: transitionEndHandler, id: `details_transend_${summary.textContent.slice(0, 10)}` });

		// Cleanup for the dataset attribute
		allAddedListeners.push({
			element: details, // Reference to the details element
			type: "cleanup-details-processed", // Custom type for cleanup logic
			handler: () => {
				if (details) details.removeAttribute("data-details-processed");
			},
			id: `details_cleanup_${summary.textContent.slice(0, 10)}`,
		});
	});
	return allAddedListeners;
}

// --- REACT COMPONENT ---
const md = new MarkdownIt({ html: true, linkify: true, typographer: true })
	.use(markdownItAnchor, { permalink: true, permalinkSymbol: " 󰓼", permalinkSpace: false })
	.use(markdownItHighlight)
	.use(katex)
	.use(mark)
	.use(sub)
	.use(sup)
	.use(align)
	.use(spoiler)
	.use(tab)
	.use(container, { name: "warning", openRender: (t, i, o) => (t[i].nesting === 1 ? `<div class="custom-block warning"><em class="custom-block-title"> Warning</em>\n` : `</div>\n`) })
	.use(container, { name: "caution", openRender: (t, i, o) => (t[i].nesting === 1 ? `<div class="custom-block caution"><em class="custom-block-title"> Caution</em>\n` : `</div>\n`) })
	.use(container, { name: "tip", openRender: (t, i, o) => (t[i].nesting === 1 ? `<div class="custom-block tip"><em class="custom-block-title"> Tip</em>\n` : `</div>\n`) })
	.use(container, { name: "note", openRender: (t, i, o) => (t[i].nesting === 1 ? `<div class="custom-block note"><em class="custom-block-title"> Note</em>\n` : `</div>\n`) })
	.use(container, { name: "hint", openRender: (t, i, o) => (t[i].nesting === 1 ? `<div class="custom-block hint"><em class="custom-block-title"> Hint</em>\n` : `</div>\n`) })
	.use(container, { name: "important", openRender: (t, i, o) => (t[i].nesting === 1 ? `<div class="custom-block important"><em class="custom-block-title"> Important</em>\n` : `</div>\n`) });

function App() {
	const [toc, setToc] = useState([]);
	const [currentMarkdown, setCurrentMarkdown] = useState("");
	// currentHtml is no longer needed as state, rendering is handled in useEffect
	const [currentPath, setCurrentPath] = useState("");
	const [isLoadingContent, setIsLoadingContent] = useState(true);
	const [initialLoadError, setInitialLoadError] = useState(null);
	const [isTransitioning, setIsTransitioning] = useState(false);

	const contentRef = useRef(null); // Ref for the markdown content div

	const handleMinimize = () => runtime.WindowMinimise();
	const handleClose = () => runtime.Quit();

	useEffect(() => {
		const fetchInitialBookData = async () => {
			setIsLoadingContent(true);
			setInitialLoadError(null);
			try {
				const bookData = await GetBookData();
				if (bookData.error) {
					setInitialLoadError(bookData.error);
					setToc(bookData.toc || []);
					setCurrentMarkdown(bookData.initialMarkdown || `# Error\n\n${bookData.error}`);
					setCurrentPath(bookData.initialPath || "");
				} else {
					setToc(bookData.toc);
					setCurrentMarkdown(bookData.initialMarkdown);
					setCurrentPath(bookData.initialPath);
				}
			} catch (err) {
				const errorMsg = err.message || "Failed to load book structure.";
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
			if (!relativePath || !relativePath.toLowerCase().endsWith(".md")) return;
			if (relativePath === currentPath && currentMarkdown) return;

			setIsTransitioning(true);
			setTimeout(async () => {
				setIsLoadingContent(true); // Show loader while content is fetched
				try {
					const mdContent = await GetMarkdownContent(relativePath);
					setCurrentMarkdown(mdContent); // This will trigger the content processing useEffect
					setCurrentPath(relativePath);
					if (contentRef.current) contentRef.current.scrollTop = 0;
				} catch (err) {
					setCurrentMarkdown(`# Error loading content\n\nCould not load: \`${relativePath}\`\n\n${err.message}`);
				} finally {
					// Content processing useEffect will handle rendering and DOM enhancements.
					// isLoadingContent will be set to false there after processing.
					// For a smoother visual, ensure isLoadingContent is true until markdown is rendered.
					// The main useEffect will set isLoadingContent based on its processing.
					// We can set it here, but the main effect might override.
					// It's better to let the content processing effect handle it.
					// For now, we'll set isLoading to false and transitioning to false.
					setIsLoadingContent(false);
					setIsTransitioning(false);
				}
			}, 300); // Match CSS transition time for fade-out
		},
		[currentPath, currentMarkdown], // currentMarkdown is needed if we check it in the condition
	);

	// UPDATED processImages with /bookassets/ and refined path normalization
	const processImages = useCallback(
		(htmlContentInput) => {
			if (!htmlContentInput) return htmlContentInput;
			const tempDiv = document.createElement("div");
			tempDiv.innerHTML = htmlContentInput;
			const images = tempDiv.querySelectorAll("img");

			images.forEach((img) => {
				let src = img.getAttribute("src");
				if (!src || src.startsWith("data:") || src.startsWith("http:") || src.startsWith("https://")) {
					return;
				}

				let resolvedPath;
				if (src.startsWith("/")) {
					// Absolute path from book root e.g. "/images/pic.png"
					resolvedPath = src.substring(1); // Remove leading slash
				} else {
					// Relative path e.g. "pic.png" or "../images/pic.png"
					const currentDir = currentPath.substring(0, currentPath.lastIndexOf("/") + 1);
					const combinedPath = currentDir + src;
					const parts = combinedPath.split("/");
					const newParts = [];
					for (const part of parts) {
						if (part === "." || part === "") continue;
						if (part === "..") {
							if (newParts.length > 0 && newParts[newParts.length - 1] !== "..") {
								newParts.pop();
							} else {
								// Cannot go above root of served dir, or it's a path like ../../image.png from root
								newParts.push(part); // Keep ".." if it's trying to go above, server will handle
							}
						} else {
							newParts.push(part);
						}
					}
					resolvedPath = newParts.join("/");
				}
				img.setAttribute("src", `/bookassets/${resolvedPath}`);
			});
			return tempDiv.innerHTML;
		},
		[currentPath],
	);

	// --- CONSOLIDATED useEffect for Markdown Processing and DOM Enhancements ---
	useEffect(() => {
		const contentEl = contentRef.current;
		if (!contentEl) return;

		// Start loading indication if not already loading (e.g. initial load)
		// This is tricky as loadChapter also sets it.
		// We primarily want to ensure that isLoadingContent is true *during* this effect's heavy lifting.
		// However, this effect runs *after* currentMarkdown is set.
		// The loadChapter sets isLoadingContent=true *before* fetching and setting currentMarkdown.

		if (!currentMarkdown) {
			contentEl.innerHTML = "";
			// Clear any "processed" flags on details/copy buttons if content is wiped
			contentEl.querySelectorAll("[data-details-processed]").forEach((el) => el.removeAttribute("data-details-processed"));
			contentEl.querySelectorAll("[data-copy-listener-attached]").forEach((el) => el.removeAttribute("data-copy-listener-attached"));
			return; // No content to process
		}

		let allCleanupFunctions = [];
		try {
			// 1. Render Markdown to HTML string
			let html = md.render(currentMarkdown);
			// 2. Process images (modifies HTML string)
			html = processImages(html); // processImages is a useCallback dep
			// 3. Set HTML content
			contentEl.innerHTML = html;

			// 4. Apply DOM enhancements now that HTML is in the DOM
			addCopyButtonsToCodeBlocks(contentEl); // This function is designed to be somewhat idempotent

			const copyButtonListeners = setupCopyButtonListeners(contentEl);
			allCleanupFunctions = allCleanupFunctions.concat(copyButtonListeners);

			const detailEnhancements = makeDetails(contentEl); // Refactored makeDetails
			allCleanupFunctions = allCleanupFunctions.concat(detailEnhancements);
		} catch (error) {
			console.error("Error processing markdown or applying customisations:", error);
			contentEl.innerHTML = `<div class="error">Failed to render content: ${error.message}</div>`;
		}

		return () => {
			allCleanupFunctions.forEach(({ element, type, handler }) => {
				if (element && type && handler) {
					if (type.startsWith("cleanup-")) {
						// Custom cleanup actions
						handler();
					} else {
						element.removeEventListener(type, handler);
					}
				}
			});
			// It's generally good practice to also clear dataset attributes on elements
			// that might persist if innerHTML isn't fully clearing them or if elements are reused.
			// The specific cleanup handlers for 'details-processed' and 'copy-listener-attached' do this.
		};
	}, [currentMarkdown, processImages]); // processImages is a dep because it uses currentPath

	const handleLinkClick = useCallback(
		(event) => {
			const target = event.target.closest("a"); // Handle clicks on elements inside <a>
			if (!target) return;

			const href = target.getAttribute("href");
			if (!href) return;

			if (href.startsWith("#") && !href.endsWith(".md")) {
				// Internal anchor link, let the browser handle it or implement smooth scroll
				// To ensure it works with markdown-it-anchor, check if it's just an ID
				const elementId = href.substring(1);
				const element = document.getElementById(elementId);
				if (element) {
					event.preventDefault();
					element.scrollIntoView({ behavior: "smooth" });
				}
				// If not a direct ID, it might be a path, let other conditions handle it.
				return; // Or let browser handle if that's preferred for non-.md hashes
			}

			if (href.endsWith(".md") || (!href.startsWith("http") && !href.startsWith("#") && !href.startsWith("/"))) {
				event.preventDefault();
				let targetPath = href;
				if (!href.startsWith("/") && currentPath && !href.toLowerCase().startsWith("http")) {
					const currentDir = currentPath.substring(0, currentPath.lastIndexOf("/") + 1);
					// Basic path normalization (same as in processImages essentially)
					const combinedPath = currentDir + href;
					const parts = combinedPath.split("/");
					const newParts = [];
					for (const part of parts) {
						if (part === "." || part === "") continue;
						if (part === "..") {
							if (newParts.length > 0 && newParts[newParts.length - 1] !== "..") newParts.pop();
							else newParts.push(part); // Allow ../ at start, server resolves
						} else newParts.push(part);
					}
					targetPath = newParts.join("/");
				}
				loadChapter(targetPath);
			} else if (href.startsWith("http")) {
				event.preventDefault();
				BrowserOpenURL(href);
			}
			// Other cases (e.g. absolute local paths /foo/bar.md if you support them) are not handled here
		},
		[currentPath, loadChapter],
	);

	useEffect(() => {
		// Event delegation for link clicks on the content area
		const contentEl = contentRef.current; // Use ref
		if (contentEl) {
			contentEl.addEventListener("click", handleLinkClick);
			return () => contentEl.removeEventListener("click", handleLinkClick);
		}
	}, [handleLinkClick]); // Re-attach if handleLinkClick changes (due to its own deps)

	useEffect(() => {
		document.addEventListener("click", handleGlobalClickForRipple);
		return () => document.removeEventListener("click", handleGlobalClickForRipple);
	}, []);

	// Example: If arrow-style and plus-style are part of App's static JSX
	useEffect(() => {
		const arrowStyleButton = document.getElementById("arrow-style"); // Assuming these IDs exist
		const plusStyleButton = document.getElementById("plus-style");

		const arrowClickHandler = () => {
			contentRef.current?.querySelectorAll("details").forEach((el) => el.classList.remove("plus-minus"));
			arrowStyleButton?.classList.add("active");
			plusStyleButton?.classList.remove("active");
		};
		const plusClickHandler = () => {
			contentRef.current?.querySelectorAll("details").forEach((el) => el.classList.add("plus-minus"));
			plusStyleButton?.classList.add("active");
			arrowStyleButton?.classList.remove("active");
		};

		if (arrowStyleButton && plusStyleButton) {
			arrowStyleButton.addEventListener("click", arrowClickHandler);
			plusStyleButton.addEventListener("click", plusClickHandler);
		}
		return () => {
			arrowStyleButton?.removeEventListener("click", arrowClickHandler);
			plusStyleButton?.removeEventListener("click", plusClickHandler);
		};
	}, []); // Runs once if arrow/plusStyleButton are static

	// Hardcoded path for OpenFolder - for a real app, make this dynamic
	const folderPathToOpen = "book/LimpBook"; // Example: Open the book's root
	const handleOpenBookFolder = () => {
		OpenFolder(folderPathToOpen)
			.then(() => console.log("Folder opened"))
			.catch((err) => console.error("Error opening folder:", err));
	};

	const contentWrapperClasses = [
		"content-view-wrapper",
		"hide-scrollbar",
		isTransitioning ? "content-fading-out" : "", // For fade out
		!isTransitioning && !isLoadingContent ? "content-faded-in" : "", // For fade in
	]
		.filter(Boolean)
		.join(" ");

	return (
		<div id="app-container">
			<div className="title-bar" style={{ "--wails-draggable": "drag" }}>
				<div className="title-bar-text">  devodocs</div>
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

				<div className={contentWrapperClasses}>
					{" "}
					{/* Wrapper for scrolling & transitions */}
					{initialLoadError && (
						<div className="error-indicator global-error">
							<h3>Failed to Load Book</h3>
							<pre>{initialLoadError}</pre>
						</div>
					)}
					{/* The loading indicator should ideally be visible during transitions too if content isn't ready */}
					{isLoadingContent && <div className="loading-indicator content-loading">Loading Content...</div>}
					{/* Render this div always, but its content changes. Opacity can be controlled by parent. */}
					<div ref={contentRef} className="markdown-content hide-scrollbar">
						{/* HTML is inserted here by the main useEffect */}
					</div>
				</div>

				<div className="toc-footer">
					<button onClick={handleOpenBookFolder} className="openFolderButton" title={`Open: ${folderPathToOpen}`}>
						<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="18" height="18">
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={1.5}
								d="M20.361 18.58c-.405.39-.943.641-1.536.684l-1.638.117a73 73 0 0 1-10.374 0l-1.514-.108a2.63 2.63 0 0 1-2.398-2.15a24.2 24.2 0 0 1-.222-7.244L2.95 7.61a2.68 2.68 0 0 1 2.66-2.36h2.292c1.118 0 2.05.798 2.255 1.856h8.314c1.307 0 2.42.95 2.625 2.24l.064.4l.04.254h.335a2.093 2.093 0 0 1 1.951 2.852l-1.25 3.213a5.9 5.9 0 0 1-1.876 2.514m-.745-8.998l.064.401q0 .008.003.017H10.37a2.75 2.75 0 0 0-2.565 1.757L5.473 17.78l-.068-.005a1.13 1.13 0 0 1-1.03-.922a22.7 22.7 0 0 1-.208-6.796l.273-2.27A1.18 1.18 0 0 1 5.61 6.75h2.292c.44 0 .797.357.797.797c0 .585.474 1.06 1.06 1.06h8.712c.57 0 1.054.413 1.144.975M7.039 17.893a71 71 0 0 0 10.041-.008l1.638-.118l.195-.018l-.002-.002a4.38 4.38 0 0 0 1.929-2.226l1.25-3.213a.593.593 0 0 0-.554-.808H10.37c-.516 0-.979.317-1.165.799z"
							/>
						</svg>
						{/* Open Book Folder */}
					</button>
				</div>
			</div>
		</div>
	);
}

export default App;

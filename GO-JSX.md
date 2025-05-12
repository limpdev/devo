## `app.go`

```go
// app.go
package main

import (
	"context"
	"fmt"
	"io/ioutil" // To read files
	"log"
	"os"            // For file operations
	"path/filepath" // For path manipulation
)

// App struct
type App struct {
	ctx context.Context
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	log.Println("..󰟓 Ignition ..Startup Now Eminent  ..")
}

// shutdown is called at application termination
func (a *App) shutdown(ctx context.Context) {
	log.Println("App Shutdown: Performing cleanup...")
	log.Println("Cleanup finished. Goodbye!")
}

func (a *App) ClipboardGetText(ctx context.Context) (string, error) {
	// Implement your logic to get text from the clipboard here
	log.Println("Get Text triggered")
	return "", nil
}

func (a *App) ClipboardSetText(ctx context.Context) (string, error) {
	// Implement your logic to set text to the clipboard here
	log.Println("Set Text triggered")
	return "", nil
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Welcome, %s, your home for knowledge", name)
}

// GetMarkdownContent reads a specific markdown file and returns its content.
// For now, let's hardcode a path. Later, you can make this dynamic.
// Example: Read from your mdbook's source.
func (a *App) GetMarkdownContent(relativePath string) (string, error) {
	// Define a base directory for your markdown files, e.g., your mdbook's src
	// For safety, ensure the baseDir is something you control.
	// IMPORTANT: In a real app, you'd want to be very careful about
	// allowing arbitrary file paths. Sanitize `relativePath` or use a whitelist.
	baseDir := "book/LimpBook" // Assuming your mdbook source is in ./book/src

	// Clean and join the path to prevent path traversal issues
	// filepath.Join cleans the path.
	// filepath.Clean prevents ".." and other tricks if baseDir was absolute.
	// However, for relative baseDir, we should resolve to absolute first for safety.
	absBaseDir, err := filepath.Abs(baseDir)
	if err != nil {
		log.Printf("Error getting absolute path for baseDir: %v", err)
		return "", fmt.Errorf("internal server error: could not determine base directory")
	}

	// Clean the relativePath to prevent it from escaping the intended directory
	// by removing leading slashes or ".." components that might try to go above baseDir
	cleanedRelativePath := filepath.Clean(filepath.Join("/", relativePath)) // Add leading / to treat as root for Clean
	if len(cleanedRelativePath) > 0 && cleanedRelativePath[0] == '/' {      // Remove leading / from Join
		cleanedRelativePath = cleanedRelativePath[1:]
	}

	targetPath := filepath.Join(absBaseDir, cleanedRelativePath)

	// Security check: Ensure the resolved targetPath is still within absBaseDir
	// This helps prevent '..' in relativePath from escaping absBaseDir
	if !filepath.HasPrefix(targetPath, absBaseDir) {
		log.Printf("Security alert: Attempt to access file outside base directory: %s (resolved to %s)", relativePath, targetPath)
		return "", fmt.Errorf("invalid file path")
	}

	log.Printf("Attempting to read markdown file: %s", targetPath)

	// Check if the file exists
	if _, err := os.Stat(targetPath); os.IsNotExist(err) {
		log.Printf("Markdown file not found: %s", targetPath)
		return "", fmt.Errorf("markdown file not found: %s", relativePath)
	}

	content, err := ioutil.ReadFile(targetPath)
	if err != nil {
		log.Printf("Error reading markdown file %s: %v", targetPath, err)
		return "", fmt.Errorf("could not read markdown file: %w", err)
	}
	return string(content), nil
}

func (a *App) WindowReload(ctx context.Context) {
	log.Println("Window reload triggered")
	// Implement your logic to reload the window here
}

func (a *App) WindowReloadApp(ctx context.Context) {
	log.Println("App reload triggered")
	// Implement your logic to reload the app here
}

func (a *App) WindowSetAlwaysOnTop(ctx context.Context) {
	log.Println("Window set to always on top")
	// Implement your logic to set the window always on top here
}

// GetBookData retrieves the book's Table of Contents and the content of the first chapter.
func (a *App) GetBookData() (BookData, error) {
	summaryFilePath := filepath.Join(bookSrcPath, "SUMMARY.md")
	log.Printf("Attempting to load book data from: %s", summaryFilePath)

	var bookData BookData

	toc, firstChapterRelPath, err := a.parseSummaryMD(summaryFilePath)
	if err != nil {
		errMsg := fmt.Sprintf("Error parsing SUMMARY.md: %v", err)
		log.Println(errMsg)
		bookData.Error = errMsg
		// Return what we have, frontend can display error
		return bookData, fmt.Errorf(errMsg) // Or return bookData with error field set
	}
	bookData.TOC = toc

	if firstChapterRelPath == "" {
		// Fallback if no chapter found in SUMMARY.md, or SUMMARY.md is empty/missing
		firstChapterRelPath = "README.md" // A common default
		log.Printf("No initial chapter determined from SUMMARY.md, defaulting to: %s", firstChapterRelPath)
	}
	bookData.InitialPath = firstChapterRelPath

	// Load initial markdown content
	// GetMarkdownContent expects path relative to its baseDir (which is also bookSrcPath)
	initialMarkdown, err := a.GetMarkdownContent(firstChapterRelPath)
	if err != nil {
		errMsg := fmt.Sprintf("Error loading initial chapter '%s': %v", firstChapterRelPath, err)
		log.Println(errMsg)
		bookData.Error = fmt.Sprintf("%s (Initial Content Load: %s)", bookData.Error, errMsg) // Append error
		// Send placeholder markdown or error message as content
		bookData.InitialMarkdown = fmt.Sprintf("# Error Loading Content\n\nCould not load: `%s`\n\n**Details:**\n```\n%s\n```", firstChapterRelPath, err.Error())
	} else {
		bookData.InitialMarkdown = initialMarkdown
	}

	log.Printf("Successfully loaded book data. Initial chapter: %s", firstChapterRelPath)
	return bookData, nil // Return nil error if TOC parsed, even if initial content failed (error is in BookData.Error)
}
```

## `bookParser.go`

```go
// app.go (or bookParser.go)
package main

import (
	"bufio"
	"fmt"
	"log"
	"os"
	"regexp"
	"strings"
)

// ... (App struct, NewApp, startup, shutdown, Greet, GetMarkdownContent from previous steps)

const bookSrcPath = "./book/LimpBook/" // Define base path for book source

// parseSummaryMD parses the SUMMARY.md file and returns a slice of TOCItem and the first chapter path.
func (a *App) parseSummaryMD(summaryFilePath string) ([]TOCItem, string, error) {
	file, err := os.Open(summaryFilePath)
	if err != nil {
		return nil, "", fmt.Errorf("failed to open SUMMARY.md '%s': %w", summaryFilePath, err)
	}
	defer file.Close()

	var toc []TOCItem
	var firstChapterPath string = ""

	// Regex to capture: indent, title, path
	// Example: `  - [My Chapter](./my-chapter.md)`
	// Handles '*' or '-' list markers.
	// (?P<indent>\s*) captures leading spaces.
	// (?P<title>[^\]]+) captures text inside [].
	// (?P<path>[^\)]*) captures text inside (), allows empty path for section headers.
	re := regexp.MustCompile(`^(?P<indent>\s*)[-*]\s*\[(?P<title>[^\]]+)\]\((?P<path>[^\)]*)\)`)

	scanner := bufio.NewScanner(file)
	var parentStack []*[]TOCItem            // Stack to manage current parent for nesting
	parentStack = append(parentStack, &toc) // Root level
	lastLevel := -1

	for scanner.Scan() {
		line := scanner.Text()
		trimmedLine := strings.TrimSpace(line)

		// Skip empty lines or lines not starting with a list marker (simple filter)
		if trimmedLine == "" || (!strings.HasPrefix(trimmedLine, "- ") && !strings.HasPrefix(trimmedLine, "* ")) {
			continue
		}

		matches := re.FindStringSubmatch(line)
		if len(matches) == 0 {
			// Might be a section header without a link, or just text.
			// For simplicity, we'll try a simpler regex for titles without links,
			// or ignore lines that don't match the link pattern for now.
			// Example: `- Section Title` (mdbook might allow this, we'll make it need a dummy link for now: `[]()`)
			// For now, we primarily care about linked items.
			log.Printf("Skipping line in SUMMARY.md (no match): %s", line)
			continue
		}

		matchMap := make(map[string]string)
		for i, name := range re.SubexpNames() {
			if i != 0 && name != "" {
				matchMap[name] = matches[i]
			}
		}

		title := strings.TrimSpace(matchMap["title"])
		path := strings.TrimSpace(matchMap["path"])
		indentStr := matchMap["indent"]
		currentLevel := len(indentStr) / 2 // Assuming 2 spaces per indent level. Adjust if your mdbook uses different (e.g. 4)

		// Clean path: remove ./
		if strings.HasPrefix(path, "./") {
			path = path[2:]
		}

		item := TOCItem{Title: title, Path: path, Level: currentLevel}

		if path != "" && strings.HasSuffix(strings.ToLower(path), ".md") && firstChapterPath == "" {
			firstChapterPath = path
		}

		if currentLevel > lastLevel {
			// New deeper level: current item's children will be the new parent list.
			// Get the last item added to the *current* parent list.
			currentParentList := parentStack[len(parentStack)-1]
			if len(*currentParentList) > 0 {
				lastItemInParent := &(*currentParentList)[len(*currentParentList)-1]
				parentStack = append(parentStack, &lastItemInParent.Children)
			} else {
				// This case (e.g. first item is indented) means it's still part of the current parent scope.
				// Or could indicate a malformed SUMMARY.md. For simplicity, add to current parent.
			}
		} else if currentLevel < lastLevel {
			// Moving up: pop from stack for each level decreased
			for i := 0; i < (lastLevel - currentLevel); i++ {
				if len(parentStack) > 1 { // Don't pop the root
					parentStack = parentStack[:len(parentStack)-1]
				}
			}
		}
		// If currentLevel == lastLevel, parent remains the same.

		targetList := parentStack[len(parentStack)-1]
		*targetList = append(*targetList, item)
		lastLevel = currentLevel
	}

	if err := scanner.Err(); err != nil {
		return nil, "", fmt.Errorf("error scanning SUMMARY.md: %w", err)
	}

	// If firstChapterPath is still empty (e.g. SUMMARY.md has no .md links or is empty)
	// try to find the first .md file in the parsed TOC.
	if firstChapterPath == "" && len(toc) > 0 {
		firstChapterPath = findFirstMarkdownFileInTOC(toc)
	}

	return toc, firstChapterPath, nil
}

// Helper to find the first .md file in a TOC structure (depth-first)
func findFirstMarkdownFileInTOC(items []TOCItem) string {
	for _, item := range items {
		if item.Path != "" && strings.HasSuffix(strings.ToLower(item.Path), ".md") {
			return item.Path
		}
		if len(item.Children) > 0 {
			childPath := findFirstMarkdownFileInTOC(item.Children)
			if childPath != "" {
				return childPath
			}
		}
	}
	return ""
}
```

## `bookTypes.go`

```go
package main

// TOCItem represents an item in the Table of Contents
type TOCItem struct {
	Title    string    `json:"title"`
	Path     string    `json:"path,omitempty"` // Relative path to the .md file from ./book/src/
	Level    int       `json:"level"`          // Indentation level
	Children []TOCItem `json:"children,omitempty"`
}

// BookData holds the TOC and the content of the initially loaded chapter
type BookData struct {
	TOC             []TOCItem `json:"toc"`
	InitialMarkdown string    `json:"initialMarkdown"`
	InitialPath     string    `json:"initialPath"`     // Path of the initially loaded markdown
	Error           string    `json:"error,omitempty"` // In case of loading errors
}
```

## `frontend\src\App.jsx`

```
// frontend/src/App.jsx
import { useState, useEffect, useCallback } from "react";
import * as runtime from "../wailsjs/runtime/runtime";
import { Icon } from "@iconify/react";
// Import markdown-it instead of remark
import MarkdownIt from "markdown-it";
import markdownItAnchor from "markdown-it-anchor";
import markdownItHighlight from "markdown-it-highlightjs";

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
		permalinkSymbol: "󰓼",
		permalinkSpace: false,
	})
	.use(markdownItHighlight);

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
```

## `frontend\src\components\TableOfContents.jsx`

```
// frontend/src/components/TableOfContents.jsx
import React from "react";
import "./TableOfContents.css";

const TOCItemLink = ({ item, onItemClick, currentPath, level }) => {
	const isCurrent = item.path && item.path === currentPath;
	const effectiveLevel = typeof level === "number" ? level : item.level || 0;

	// Only make items with .md paths clickable for content loading.
	// Items with empty path might be section headers.
	const isClickable = item.path && item.path.toLowerCase().endsWith(".md");

	return (
		<li>
			{isClickable ? (
				<a
					href={`#${item.path}`} // Use hash for potential SPA routing, prevent full reload
					className={`toc-item-link ${isCurrent ? "active" : ""}`}
					onClick={(e) => {
						e.preventDefault();
						onItemClick(item.path);
					}}
					style={{ paddingLeft: `${effectiveLevel * 15 + 10}px` }} // Indentation
					title={item.path}
				>
					{item.title}
				</a>
			) : (
				<span className="toc-item-header" style={{ paddingLeft: `${effectiveLevel * 15 + 10}px`, fontWeight: item.level === 0 ? "bold" : "normal" }}>
					{item.title}
				</span>
			)}
			{item.children && item.children.length > 0 && (
				<ul>
					{item.children.map((child, index) => (
						<TOCItemLink
							key={child.path || `child-${item.title}-${index}`}
							item={child}
							onItemClick={onItemClick}
							currentPath={currentPath}
							level={effectiveLevel + 1} // Pass incremented level for children
						/>
					))}
				</ul>
			)}
		</li>
	);
};

const TableOfContents = ({ tocItems, onItemClick, currentPath }) => {
	if (!tocItems || tocItems.length === 0) {
		return (
			<div className="toc-container hide-scrollbar scrollbar-none">
				<p>Table of Contents is empty or could not be loaded.</p>
			</div>
		);
	}

	return (
		<nav className="toc-container hide-scrollbar scrollbar-none">
			{/* Optional: Add a title for the TOC itself */}
			{/* <h3 className="toc-title">Contents</h3> */}
			<ul>
				{tocItems.map((item, index) => (
					<TOCItemLink
						key={item.path || `item-${item.title}-${index}`} // Ensure key is unique
						item={item}
						onItemClick={onItemClick}
						currentPath={currentPath}
						level={item.level || 0} // Pass initial level
					/>
				))}
			</ul>
		</nav>
	);
};

export default TableOfContents;
```

## `frontend\src\main.jsx`

```
import React from 'react'
import {createRoot} from 'react-dom/client'
import './style.css'
import App from './App'

const container = document.getElementById('root')

const root = createRoot(container)

root.render(
    <React.StrictMode>
        <App/>
    </React.StrictMode>
)
```

## `main.go`

```go
package main

import (
	"embed"
	"log"
	"net/http" // Import the net/http package
	"strings"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver" // Import assetserver options
	"github.com/wailsapp/wails/v2/pkg/options/mac"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS // Keep for build process, but not used for serving in this config

func main() {
	// Create an instance of the app structure
	app := NewApp()
	const bookSrcPath = "./book/LimpBook/" // Same as in app.go

	// assets := "frontend/dist" 		      // If used, the path can't be used

	// Create application with options
	err := wails.Run(&options.App{
		Title:                    "devo",
		Width:                    1024,
		Height:                   1200,
		Frameless:                true,
		Fullscreen:               false,
		HideWindowOnClose:        true,
		EnableDefaultContextMenu: true,
		OnStartup:                app.startup,
		OnShutdown:               app.shutdown,
		DragAndDrop: &options.DragAndDrop{
			EnableFileDrop:     true,
			DisableWebViewDrop: false,
			CSSDropProperty:    "--wails-drop-target",
			CSSDropValue:       "drop",
		},
		BackgroundColour: &options.RGBA{R: 0, G: 0, B: 0, A: 0},
		Windows: &windows.Options{
			WebviewIsTransparent: true, // Allows underlying window/desktop to show if HTML is *also* transparent
			WindowIsTranslucent:  true, // Usually false unless you want the whole window semi-transparent
			DisablePinchZoom:     true,
		},
		Mac: &mac.Options{
			TitleBar: &mac.TitleBar{
				TitlebarAppearsTransparent: true,
				//HideTitle:                  false,
				//HideTitleBar:               false,
				//FullSizeContent:            false,
				//UseToolbar:                 false,
				//HideToolbarSeparator:       true,
			},
			//Appearance:           mac.NSAppearanceNameDarkAqua,
			WebviewIsTransparent: true,
			WindowIsTranslucent:  false,
			About: &mac.AboutInfo{
				Title: "devo",
			},
		},
		// main.go (AssetServer part)
		AssetServer: &assetserver.Options{
			Assets: assets, // Serves the React frontend
			Middleware: func(next http.Handler) http.Handler {
				return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					path := r.URL.Path
					// Serve assets for markdown (e.g. images) from ./book/LimpBook/
					if strings.HasPrefix(path, "frontend/dist") {
						// log.Printf("Serving book asset: %s", path) // For debugging
						http.StripPrefix("frontend/dist", http.FileServer(http.Dir(bookSrcPath))).ServeHTTP(w, r)
						return
					}
					log.Printf("Serving frontend asset: %s", path) // For debugging
					next.ServeHTTP(w, r)                           // Let Wails serve the React app
				})
			},
		},
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		log.Fatal(err)
	}
}
```


# New Business

==Creating menus, of various types==   Define a `struct` and call the runtime method, `MenuSetApplicationMenu`.

```go
    app := NewApp()

    AppMenu := menu.NewMenu()
    if runtime.GOOS == "darwin" {
        AppMenu.Append(menu.AppMenu()) // On macOS platform, this must be done right after `NewMenu()`
    }
    FileMenu := AppMenu.AddSubmenu("File")
    FileMenu.AddText("&Open", keys.CmdOrCtrl("o"), func(_ *menu.CallbackData) {
        // do something
    })
    FileMenu.AddSeparator()
    FileMenu.AddText("Quit", keys.CmdOrCtrl("q"), func(_ *menu.CallbackData) {
        // `rt` is an alias of "github.com/wailsapp/wails/v2/pkg/runtime" to prevent collision with standard package
        rt.Quit(app.ctx)
    })

    if runtime.GOOS == "darwin" {
    AppMenu.Append(menu.EditMenu())  // On macOS platform, EditMenu should be appended to enable Cmd+C, Cmd+V, Cmd+Z... shortcuts
    }

    err := wails.Run(&options.App{
        Title:             "Menus Demo",
        Width:             800,
        Height:            600,
        Menu:              AppMenu, // reference the menu above
        Bind: []interface{}{
            app,
        },
    )
    // ...
```
**Dynamically Updating the Menu**  use `MenuUpdateApplicationMenu`. Menus are just collections of `MenuItems`.

```go
type Menu struct {
	Items []*MenuItem
}

// ...

func NewMenuFromItems(first *MenuItem, rest ...*MenuItem) *Menu

// Structs for individual MenuItems, too
// MenuItem represents a menu item contained in a menu
type MenuItem struct {
    Label string						// STRING - the menu text
    Role Role							// *keys.Accelerator - keybinding
    Accelerator *keys.Accelerator		// TYPE - the type of MenuItem
    Type Type							// Disables the menu item
    Disabled bool						// Hides this item
    Hidden bool							// Adds check to item
    Checked bool						// Sets the submenu
    SubMenu *Menu						// Callback function when menu clicked
    Click Callback						// Defines a role for this menu item. MAC ONLY
}
```

::: important
The next step should be to create a **RIGHT-CLICK MENU**
:::

---
---

## FILES SUMMARIZED

<details><summary><i>Repository Files</i></summary>

## `app.go`

```go
// app.go
package main

import (
	"context"
	"fmt"
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
	baseDir := "book/LimpBook" // Assuming your mdbook source is in ./book/LimpBook

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

	content, err := os.ReadFile(targetPath)
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

## `frontend\dist\index.html`

```html
<!doctype html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta content="width=device-width, initial-scale=1.0" name="viewport" />
		<link
			rel="stylesheet"
			href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css"
			integrity="sha384-nB0miv6/jRmo5UMMR1wu3Gz6NLsoTkbqJghGIsx//Rlm+ZU03BU6SQNC66uf4l5+"
			crossorigin="anonymous"
		/>
		<!-- The loading of KaTeX is deferred to speed up page rendering -->
		<script
			defer
			src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"
			integrity="sha384-7zkQWkzuo3B5mTepMUcHkMB5jZaolc2xDwL6VFqjFALcbeS9Ggm/Yr2r3Dy4lfFg"
			crossorigin="anonymous"
		></script>
		<!-- To automatically render math in text elements, include the auto-render extension: -->
		<script
			defer
			src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"
			integrity="sha384-43gviWU0YVjaDtb/GhzOouOXtZMP/7XUzwPTstBeZFe/+rCMvRwr4yROQP43s0Xk"
			crossorigin="anonymous"
			onload="renderMathInElement(document.body);"
		></script>
		<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css" />
		<link rel="stylesheet" type="text/css" href="style.css" />
		<title> devodocs</title>
		<link
			rel="stylesheet"
			href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/atom-one-dark.min.css"
			integrity="sha512-Jk4AqjWsdSzSWCSuQTfYRIF84Rq/eV0G2+tu07byYwHcbTGfdmLrHjUSwvzp5HvbiqK4ibmNwdcG49Y5RGYPTg=="
			crossorigin="anonymous"
			referrerpolicy="no-referrer"
		/>
		<script type="module" crossorigin src="/index.js"></script>
		<link rel="stylesheet" crossorigin href="/index.css">
	</head>

	<body>
		<script
			src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js"
			integrity="sha512-EBLzUL8XLl+va/zAsmXwS7Z2B1F9HUHkZwyS/VKwh3S7T/U0nF4BaU29EP/ZSf6zgiIxYAnKLu6bJ8dqpmX5uw=="
			crossorigin="anonymous"
			referrerpolicy="no-referrer"
		></script>
		<div class="react-ui hide-scrollbar">
			<div id="root"></div>
		</div>

	</body>
</html>
```

## `frontend\html\wails.html`

```html
<!doctype html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta content="width=device-width, initial-scale=1.0" name="viewport" />
		<meta name="wails-options" content="noautoinject" />
        <script src="/wails/ipc.js"></script>
        <script src="/wails/runtime.js"></script>
		<title>devdocs</title>
	</head>
	<body>
		<div id="root"></div>
	</body>
</html>
```

## `frontend\index.html`

```html
<!doctype html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta content="width=device-width, initial-scale=1.0" name="viewport" />
		<link
			rel="stylesheet"
			href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css"
			integrity="sha384-nB0miv6/jRmo5UMMR1wu3Gz6NLsoTkbqJghGIsx//Rlm+ZU03BU6SQNC66uf4l5+"
			crossorigin="anonymous"
		/>
		<!-- The loading of KaTeX is deferred to speed up page rendering -->
		<script
			defer
			src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"
			integrity="sha384-7zkQWkzuo3B5mTepMUcHkMB5jZaolc2xDwL6VFqjFALcbeS9Ggm/Yr2r3Dy4lfFg"
			crossorigin="anonymous"
		></script>
		<!-- To automatically render math in text elements, include the auto-render extension: -->
		<script
			defer
			src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"
			integrity="sha384-43gviWU0YVjaDtb/GhzOouOXtZMP/7XUzwPTstBeZFe/+rCMvRwr4yROQP43s0Xk"
			crossorigin="anonymous"
			onload="renderMathInElement(document.body);"
		></script>
		<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css" />
		<link rel="stylesheet" type="text/css" href="style.css" />
		<title> devodocs</title>
		<link
			rel="stylesheet"
			href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/atom-one-dark.min.css"
			integrity="sha512-Jk4AqjWsdSzSWCSuQTfYRIF84Rq/eV0G2+tu07byYwHcbTGfdmLrHjUSwvzp5HvbiqK4ibmNwdcG49Y5RGYPTg=="
			crossorigin="anonymous"
			referrerpolicy="no-referrer"
		/>
	</head>

	<body>
		<script
			src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js"
			integrity="sha512-EBLzUL8XLl+va/zAsmXwS7Z2B1F9HUHkZwyS/VKwh3S7T/U0nF4BaU29EP/ZSf6zgiIxYAnKLu6bJ8dqpmX5uw=="
			crossorigin="anonymous"
			referrerpolicy="no-referrer"
		></script>
		<div class="react-ui hide-scrollbar">
			<div id="root"></div>
		</div>

		<script src="src/main.jsx" type="module"></script>
	</body>
</html>
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
import { container } from "@mdit/plugin-container";
import { katex } from "@mdit/plugin-katex";
import { mark } from "@mdit/plugin-mark";
import { sub } from "@mdit/plugin-sub";
import { sup } from "@mdit/plugin-sup";
import { tab } from "@mdit/plugin-tab";
import { align } from "@mdit/plugin-align";
import { spoiler } from "@mdit/plugin-spoiler";
// Import Go functions
import { GetBookData, GetMarkdownContent } from "../wailsjs/go/main/App";
import { BrowserOpenURL } from "../wailsjs/runtime/runtime";

import TableOfContents from "./components/TableOfContents";
import "./App.css";

// --- Custom JS Logic (Integrated) ---

// WIP - COPY BUTTONS FOR CODEBLOCKS
function addCopyButtonsToCodeBlocks(containerElement) {
    if (!containerElement) return;

    const preElements = containerElement.querySelectorAll("pre");

    preElements.forEach((preEl) => {
        // Avoid re-wrapping if already processed (e.g., by a hot reload or manual call)
        if (preEl.parentElement && preEl.parentElement.classList.contains("code-wrapper")) {
            return;
        }

        const codeEl = preEl.querySelector("code");
        if (!codeEl) return; // Only add buttons to pre tags containing code

        const wrapperDiv = document.createElement("div");
        wrapperDiv.className = "code-wrapper"; // You'll style this with position: relative

        const copyButton = document.createElement("button");
        copyButton.className = "clip-button"; // Your existing or new class for styling
        copyButton.setAttribute("aria-label", "Copy to clipboard");
        copyButton.setAttribute("title", "Copy to clipboard");

        // Initial SVG icon for the copy button (simple clipboard)
        copyButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                <path d="M4 14L14 3v7h6L10 21v-7z"/>
            </svg>
        `;

        // DOM manipulation:
        // Insert wrapper before the pre element
        preEl.parentNode.insertBefore(wrapperDiv, preEl);
        // Append the copy button to the wrapper
        wrapperDiv.appendChild(copyButton);
        // Move the pre element inside the wrapper
        wrapperDiv.appendChild(preEl);

        // Optional: Add language label (if you want it, like in templates/index.html)
        const language = codeEl.className.match(/language-(\w+)/);
        if (language && language[1]) {
            const langLabel = document.createElement('span');
            langLabel.className = 'language-label';
            langLabel.textContent = language[1];
            wrapperDiv.insertBefore(langLabel, preEl); // Or append to wrapperDiv
        }
    });
}


// Logic for handling clicks on dynamically added copy buttons
function setupCopyButtonListeners(containerElement) {
	if (!containerElement) return [];

    // UPDATED selector to find buttons within the new wrapper
	const buttons = containerElement.querySelectorAll(".code-wrapper .clip-button");
	const listeners = [];

	buttons.forEach((button) => {
        // UPDATED logic to find the code block
        const wrapper = button.closest(".code-wrapper");
		const pre = wrapper ? wrapper.querySelector("pre") : null;
		const codeBlock = pre ? pre.querySelector("code") : null;

		if (!codeBlock) {
            console.warn("Copy button found without a corresponding code block.", button);
            return;
        }

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
				svg.setAttribute("viewBox", "0 0 24 24"); // Standard checkmark viewBox
                // Keep existing width/height or set explicitly if needed
				// svg.setAttribute("width", "16");
				// svg.setAttribute("height", "16");
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
					if (originalViewBox) svg.setAttribute("viewBox", originalViewBox); else svg.removeAttribute("viewBox");
					if (originalWidth) svg.setAttribute("width", originalWidth); else svg.removeAttribute("width");
					if (originalHeight) svg.setAttribute("height", originalHeight); else svg.removeAttribute("height");
					if (originalFill) svg.setAttribute("fill", originalFill); else svg.removeAttribute("fill");
					button.setAttribute("aria-label", originalAriaLabel || "Copy to clipboard");
                    button.setAttribute("title", originalTitle || "Copy to clipboard");
					button.classList.remove("copied");
				}, 2000);
			} catch (err) {
				console.error("Failed to copy code:", err);
                const originalAriaLabel = button.getAttribute("aria-label"); // Capture before changing
                const originalTitle = button.getAttribute("title");
				button.setAttribute("aria-label", "Copy failed!");
                button.setAttribute("title", "Copy failed!");
                setTimeout(() => { // Revert error message after a bit
                    button.setAttribute("aria-label", originalAriaLabel || "Copy to clipboard");
                    button.setAttribute("title", originalTitle || "Copy to clipboard");
                }, 2000);
			}
		};

		button.addEventListener("click", clickHandler);
		listeners.push({ element: button, type: "click", handler: clickHandler });
	});

	return listeners;
}

// WORKS - Ripple Effect
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
	circle.style.opacity = "0.7"; // Start fully opaque

	// Create animate elements
	const animateRadius = document.createElementNS(svgNS, 'animate');
	animateRadius.setAttribute('attributeName', 'r');
	animateRadius.setAttribute('calcMode', 'spline');
	animateRadius.setAttribute('dur', '0.4s');
	animateRadius.setAttribute('keySplines', '.52,.6,.25,.99');
	animateRadius.setAttribute('values', '0;11');
	animateRadius.setAttribute('fill', 'freeze');
	const animateOpacity = document.createElementNS(svgNS, 'animate');
	animateOpacity.setAttribute('attributeName', 'opacity');
	animateOpacity.setAttribute('calcMode', 'spline');
	animateOpacity.setAttribute('dur', '0.4s');
	animateOpacity.setAttribute('keySplines', '.52,.6,.25,.99');
	animateOpacity.setAttribute('values', '1;0');
	animateOpacity.setAttribute('fill', 'freeze');
	// Assemble the SVG
	circle.appendChild(animateRadius);
	circle.appendChild(animateOpacity);
	svg.appendChild(circle);
	rippleContainer.appendChild(svg);
	// Append the ripple container to the body
	document.body.appendChild(rippleContainer);

	// Remove after animation completes (adjust time if animation duration changes)
	setTimeout(() => {
		if (document.body.contains(rippleContainer)) {
			document.body.removeChild(rippleContainer);
		}
	}, 600); // A bit longer than animation duration
}

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
	.use(align)
	.use(spoiler)
	.use(tab)
	.use(container, {
		name: "warning",
		openRender: (tokens, index, _options) => {
			const token = tokens[index];
			if (token.nesting === 1) {
				return `<div class="custom-block warning"><em class="custom-block-title"> Warning</em>\n`;
			} else {
				return `</div>\n`;
			}
		},
	})
	.use(container, {
		name: "caution",
		openRender: (tokens, index, _options) => {
			const token = tokens[index];
			if (token.nesting === 1) {
				return `<div class="custom-block caution"><em class="custom-block-title"> Caution</em>\n`;
			} else {
				return `</div>\n`;
			}
		},
	})
	.use(container, {
		name: "tip",
		openRender: (tokens, index, _options) => {
			const token = tokens[index];
			if (token.nesting === 1) {
				return `<div class="custom-block tip"><em class="custom-block-title"> Tip</em>\n`;
			} else {
				return `</div>\n`;
			}
		},
	})
	.use(container, {
		name: "note",
		openRender: (tokens, index, _options) => {
			const token = tokens[index];
			if (token.nesting === 1) {
				return `<div class="custom-block note"><em class="custom-block-title"> Note</em>\n`;
			} else {
				return `</div>\n`;
			}
		},
	})
	.use(container, {
		name: "hint",
		openRender: (tokens, index, _options) => {
			const token = tokens[index];
			if (token.nesting === 1) {
				return `<div class="custom-block hint"><em class="custom-block-title"> Hint</em>\n`;
			} else {
				return `</div>\n`;
			}
		},
	})
	.use(container, {
		name: "important",
		openRender: (tokens, index, _options) => {
			const token = tokens[index];
			if (token.nesting === 1) {
				return `<div class="custom-block important"><em class="custom-block-title"> Important</em>\n`;
			} else {
				return `</div>\n`;
			}
		},
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

	const [isTransitioning, setIsTransitioning] = useState(false);
	const loadChapter = useCallback(async (relativePath) => {
			if (!relativePath || !relativePath.toLowerCase().endsWith(".md")) {
				console.warn("Attempted to load non-markdown file as chapter:", relativePath);
				return;
			}
			if (relativePath === currentPath && currentMarkdown) {
				// Avoid reloading same content
				console.log("Chapter already loaded:", relativePath);
				return;
			}
		setIsTransitioning(true); 	// Triggers FADEOUT via className
		setTimeout(async () => { 	// Wait for FADEOUT
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
				// The useEffect for currentMarkdown will render.
            	// Then we remove the transitioning state to allow fade-in.
           		// This might need a slight delay or a ref to the content div
            	// to ensure DOM is updated before changing opacity.
				setIsTransitioning(false); // Triggers FADEIN, or, resets to default
			}
		}, 300);
	}, [currentPath, currentMarkdown]);

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
		if (!contentEl) return;
		if (!currentMarkdown) {
			contentEl.innerHTML = "";
			return;
		}
		try {
			let htmlContent = md.render(currentMarkdown);
			htmlContent = processImages(htmlContent); // Process images first
			contentEl.innerHTML = htmlContent; // Set HTML

            // MODIFIED: Call to add copy buttons AFTER HTML is set
			addCopyButtonsToCodeBlocks(contentEl);

		} catch (error) {
			console.error("Error processing markdown or applying customisations:", error);
			contentEl.innerHTML = `<div class="error">Failed to render content: ${error.message}</div>`;
		}
	}, [currentMarkdown, processImages]); // Rerun when markdown changes

	// --- Effect for Global Ripple Effect ---
	useEffect(() => {
		// Add the global click listener
		document.addEventListener("click", handleGlobalClickForRipple);
		// Cleanup function: Remove the global listener when App unmounts
		return () => {
			document.removeEventListener("click", handleGlobalClickForRipple);
		};
	}, []); // Empty dependency array: Runs once on mount, cleans up on unmount

	// --- Effect for setting up Copy Button Listeners ---
	// This effect now runs *after* the markdown content is rendered and buttons are added
	useEffect(() => {
		const contentEl = document.querySelector(".markdown-content");
		if (!contentEl || !currentMarkdown) return; // Also check currentMarkdown to avoid running on empty content

		const addedListeners = setupCopyButtonListeners(contentEl);
		return () => {
			addedListeners.forEach(({ element, type, handler }) => {
				element.removeEventListener(type, handler);
			});
		};
        // DEPENDENCY: currentMarkdown changing means HTML changed, so re-run.
        // processImages is not directly used by setupCopyButtonListeners, but
        // currentMarkdown implies that both processImages and addCopyButtonsToCodeBlocks
        // have potentially run.
	}, [currentMarkdown]);

	return (
		<div id="app-container">
			<div className="title-bar" style={{ "--wails-draggable": "drag" }}>
				<div className="title-bar-text">  </div>
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
var assets embed.FS // Embeds the React frontend (HTML, CSS, JS, etc.) into the binary.

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
		BackgroundColour: &options.RGBA{R: 16, G: 16, B: 16, A: 1},
		Windows: &windows.Options{
			WebviewIsTransparent: true,  // Allows underlying window/desktop to show if HTML is *also* transparent
			WindowIsTranslucent:  false, // Usually false unless you want the whole window semi-transparent
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

## `templates\index.html`

```html
<!DOCTYPE html>
<meta name="viewport" content="width=device-width, initial-scale=1" lang="en" />

<head>
	<meta charset="UTF-8" />
	<title>{{TITLE}}</title>
	<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css"
		integrity="sha384-nB0miv6/jRmo5UMMR1wu3Gz6NLsoTkbqJghGIsx//Rlm+ZU03BU6SQNC66uf4l5+" crossorigin="anonymous">
	<!-- The loading of KaTeX is deferred to speed up page rendering -->
	<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"
		integrity="sha384-7zkQWkzuo3B5mTepMUcHkMB5jZaolc2xDwL6VFqjFALcbeS9Ggm/Yr2r3Dy4lfFg"
		crossorigin="anonymous"></script>
	<!-- To automatically render math in text elements, include the auto-render extension: -->
	<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"
		integrity="sha384-43gviWU0YVjaDtb/GhzOouOXtZMP/7XUzwPTstBeZFe/+rCMvRwr4yROQP43s0Xk" crossorigin="anonymous"
		onload="renderMathInElement(document.body);"></script>
	<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css" />
	<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/limpdev/limpbin@main/css/prismHL.css" />
	<style type="text/css">
		/* Add your custom styles here */
		@import "https://www.nerdfonts.com/assets/css/webfont.css";

		article {
			display: flow;
			max-width: 1100px;
			min-width: 650px;
			justify-content: center;
			text-rendering: optimizeLegibility !important;
		}

		.markdown-body {
			--base-size-4: 0.25rem;
			--base-size-8: 0.5rem;
			--base-size-16: 1rem;
			--base-size-24: 1.5rem;
			--base-size-40: 2.5rem;
			--base-text-weight-normal: 400;
			--base-text-weight-medium: 500;
			--base-text-weight-semibold: 600;
			--fontStack-monospace: "SF Mono", "Symbols Nerd Font", Menlo, monospace;
			--fgColor-accent: Highlight;
		}

		i[class^="devicon-"] {
			font-size: 2rem;
		}

		@media (prefers-color-scheme: dark) {

			.markdown-body,
			[data-theme="dark"] {
				/* dark */
				color-scheme: dark;
				--focus-outlineColor: #1f6feb;
				--fgColor-default: #f0f6fc;
				--fgColor-muted: #9198a1;
				--fgColor-accent: #4493f8;
				--fgColor-success: #3fb950;
				--fgColor-attention: #d29922;
				--fgColor-danger: #f85149;
				--fgColor-done: #ab7df8;
				--bgColor-default: #161616;
				--bgColor-muted: #09090a;
				--bgColor-neutral-muted: #656c7633;
				--bgColor-attention-muted: #ffee0033;
				--borderColor-default: #3d444d;
				--borderColor-muted: #3d444db3;
				--borderColor-neutral-muted: #3d444db3;
				--borderColor-accent-emphasis: #1f6feb;
				--borderColor-success-emphasis: #238636;
				--borderColor-attention-emphasis: #9e6a03;
				--borderColor-danger-emphasis: #da3633;
				--borderColor-done-emphasis: #8957e5;
				--color-prettylights-syntax-comment: #9198a1;
				--color-prettylights-syntax-constant: #79c0ff;
				--color-prettylights-syntax-constant-other-reference-link: #a5d6ff;
				--color-prettylights-syntax-entity: #d2a8ff;
				--color-prettylights-syntax-storage-modifier-import: #f0f6fc;
				--color-prettylights-syntax-entity-tag: #7ee787;
				--color-prettylights-syntax-keyword: #ff7b72;
				--color-prettylights-syntax-string: #a5d6ff;
				--color-prettylights-syntax-variable: #ffa657;
				--color-prettylights-syntax-brackethighlighter-unmatched: #f85149;
				--color-prettylights-syntax-brackethighlighter-angle: #9198a1;
				--color-prettylights-syntax-invalid-illegal-text: #f0f6fc;
				--color-prettylights-syntax-invalid-illegal-bg: #8e1519;
				--color-prettylights-syntax-carriage-return-text: #f0f6fc;
				--color-prettylights-syntax-carriage-return-bg: #b62324;
				--color-prettylights-syntax-string-regexp: #7ee787;
				--color-prettylights-syntax-markup-list: #f2cc60;
				--color-prettylights-syntax-markup-heading: #1f6feb;
				--color-prettylights-syntax-markup-italic: #f0f6fc;
				--color-prettylights-syntax-markup-bold: #f0f6fc;
				--color-prettylights-syntax-markup-deleted-text: #ffdcd7;
				--color-prettylights-syntax-markup-deleted-bg: #67060c;
				--color-prettylights-syntax-markup-inserted-text: #aff5b4;
				--color-prettylights-syntax-markup-inserted-bg: #033a16;
				--color-prettylights-syntax-markup-changed-text: #ffdfb6;
				--color-prettylights-syntax-markup-changed-bg: #5a1e02;
				--color-prettylights-syntax-markup-ignored-text: #f0f6fc;
				--color-prettylights-syntax-markup-ignored-bg: #1158c7;
				--color-prettylights-syntax-meta-diff-range: #d2a8ff;
				--color-prettylights-syntax-sublimelinter-gutter-mark: #3d444d;
			}
		}

		:root,
		html,
		body {
			display: flow;
			justify-items: center;
			background-color: #161616 !important;
			color: var(--fgColor-default) !important;
			margin: 0 !important;
		}

		.markdown-body {
			padding: 25px;
			-ms-text-size-adjust: 100%;
			-webkit-text-size-adjust: 100%;
			margin: 0;
			color: var(--fgColor-default);
			background-color: #161616 !important;
			font-family: "SFProDisplay Nerd Font", "Satoshi Nerd Font", BlinkMacSystemFont, "Segoe UI", Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
			font-size: 16.5px;
			line-height: 1.3;
			word-wrap: break-word;
		}

		.markdown-body .octicon {
			display: inline-block;
			fill: currentColor;
			vertical-align: text-bottom;
		}

		.markdown-body h1:hover .anchor .octicon-link:before,
		.markdown-body h2:hover .anchor .octicon-link:before,
		.markdown-body h3:hover .anchor .octicon-link:before,
		.markdown-body h4:hover .anchor .octicon-link:before,
		.markdown-body h5:hover .anchor .octicon-link:before,
		.markdown-body h6:hover .anchor .octicon-link:before {
			width: 16px;
			height: 16px;
			content: " ";
			display: inline-block;
			background-color: currentColor;
			-webkit-mask-image: url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' version='1.1' aria-hidden='true'><path fill-rule='evenodd' d='M7.775 3.275a.75.75 0 001.06 1.06l1.25-1.25a2 2 0 112.83 2.83l-2.5 2.5a2 2 0 01-2.83 0 .75.75 0 00-1.06 1.06 3.5 3.5 0 004.95 0l2.5-2.5a3.5 3.5 0 00-4.95-4.95l-1.25 1.25zm-4.69 9.64a2 2 0 010-2.83l2.5-2.5a2 2 0 012.83 0 .75.75 0 001.06-1.06 3.5 3.5 0 00-4.95 0l-2.5 2.5a3.5 3.5 0 004.95 4.95l1.25-1.25a.75.75 0 00-1.06-1.06l-1.25 1.25a2 2 0 01-2.83 0z'></path></svg>");
			mask-image: url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' version='1.1' aria-hidden='true'><path fill-rule='evenodd' d='M7.775 3.275a.75.75 0 001.06 1.06l1.25-1.25a2 2 0 112.83 2.83l-2.5 2.5a2 2 0 01-2.83 0 .75.75 0 00-1.06 1.06 3.5 3.5 0 004.95 0l2.5-2.5a3.5 3.5 0 00-4.95-4.95l-1.25 1.25zm-4.69 9.64a2 2 0 010-2.83l2.5-2.5a2 2 0 012.83 0 .75.75 0 001.06-1.06 3.5 3.5 0 00-4.95 0l-2.5 2.5a3.5 3.5 0 004.95 4.95l1.25-1.25a.75.75 0 00-1.06-1.06l-1.25 1.25a2 2 0 01-2.83 0z'></path></svg>");
		}

		.markdown-body details,
		.markdown-body figcaption,
		.markdown-body figure {
			display: block;
		}

		.markdown-body summary {
			display: list-item;
		}

		.markdown-body [hidden] {
			display: none !important;
		}

		.markdown-body a {
			background-color: transparent;
			color: var(--fgColor-accent);
			text-decoration: none;
		}

		.markdown-body abbr[title] {
			border-bottom: none;
			-webkit-text-decoration: underline dotted;
			text-decoration: underline dotted;
		}

		.markdown-body b,
		.markdown-body strong {
			font-weight: var(--base-text-weight-semibold, 600);
		}

		.markdown-body dfn {
			font-style: italic;
		}

		.markdown-body h1 {
			margin: 0.67em 0;
			font-weight: var(--base-text-weight-semibold, 600);
			padding-bottom: 0.3em;
			font-size: 2em;
			border-bottom: 1px solid var(--borderColor-muted);
		}

		.markdown-body mark {
			background-color: #ffee0033;
			color: var(--fgColor-default);
			padding: 3px;
			border-radius: 4px;
		}

		.markdown-body small {
			font-size: 90%;
		}

		.markdown-body sub,
		.markdown-body sup {
			font-size: 75%;
			line-height: 0;
			position: relative;
			vertical-align: baseline;
		}

		.markdown-body sub {
			bottom: -0.25em;
		}

		.markdown-body sup {
			top: -0.5em;
		}

		.markdown-body img {
			border-style: none;
			max-width: 100%;
			width: 25%;
			box-sizing: content-box;
		}

		.markdown-body code,
		.markdown-body kbd,
		.markdown-body pre,
		.markdown-body samp {
			font-family: var(--font-family-monospace);
			font-size: 1em;
		}

		.markdown-body figure {
			margin: 1em var(--base-size-40);
		}

		.markdown-body hr {
			box-sizing: content-box;
			overflow: hidden;
			background: transparent;
			border-bottom: 1px solid var(--borderColor-muted);
			height: 0.25em;
			padding: 0;
			margin: var(--base-size-24) 0;
			background-color: var(--borderColor-default);
			border: 0;
		}

		.markdown-body input {
			font: inherit;
			margin: 0;
			overflow: visible;
			font-family: inherit;
			font-size: inherit;
			line-height: inherit;
		}

		.markdown-body [type="button"],
		.markdown-body [type="reset"],
		.markdown-body [type="submit"] {
			-webkit-appearance: button;
			appearance: button;
		}

		.markdown-body [type="checkbox"],
		.markdown-body [type="radio"] {
			box-sizing: border-box;
			padding: 0;
		}

		.markdown-body [type="number"]::-webkit-inner-spin-button,
		.markdown-body [type="number"]::-webkit-outer-spin-button {
			height: auto;
		}

		.markdown-body [type="search"]::-webkit-search-cancel-button,
		.markdown-body [type="search"]::-webkit-search-decoration {
			-webkit-appearance: none;
			appearance: none;
		}

		.markdown-body ::-webkit-input-placeholder {
			color: inherit;
			opacity: 0.54;
		}

		.markdown-body ::-webkit-file-upload-button {
			-webkit-appearance: button;
			appearance: button;
			font: inherit;
		}

		.markdown-body a:hover {
			text-decoration: underline;
		}

		.markdown-body ::placeholder {
			color: var(--fgColor-muted);
			opacity: 1;
		}

		table {
			padding: 0;
			border-collapse: collapse;
			margin-left: auto;
			margin-right: auto;
			text-align: center;
		}

		table tr {
			/* border-top: 1px solid #cccccc; */
			background-color: #0b182a;
			margin: 0;
			padding: 0;
		}

		table tr:nth-child(2n) {
			background-color: #f8f8f8;
		}

		table tr th {
			font-family: "Roboto Slab", sans-serif;
			font-weight: bold;
			/* border: 0.5px solid #cccccc; */
			/* border-left: 0.5px solid #cccccc;
      border-right: 0.5px solid #cccccc; */
			background-color: #0b182a;
			font-size: 15px;
			margin: 0;
			padding: 0.4em 0.35em 0.4em 0.35em;
		}

		table tr td {
			/* border: 1px solid #cccccc; */
			margin: 0;
			font-size: 14px;
			padding: 5px 5px;
		}

		table tr th :first-child,
		table tr td :first-child {
			margin-top: 0;
		}

		table tr th :last-child,
		table tr td :last-child {
			margin-bottom: 0;
		}

		.markdown-body table tr:nth-child(2n),
		.markdown-body table tr {
			transition: all 300ms ease-in-out;
		}

		.markdown-body table tr:hover {
			background-color: #f8f8f81b;
		}

		.markdown-body table tr:nth-child(2n):hover {
			background-color: #f8f8f81b;
		}

		/* .markdown-body hr::before {
			display: table;
			content: "";
		}
		.markdown-body hr::after {
			display: table;
			clear: both;
			content: "";
		}
		.markdown-body table {
			border-spacing: 0;
			border-collapse: collapse;
			display: block;
			width: max-content;
			max-width: 100%;
			overflow: auto;
			overflow-wrap: anywhere;
			font-variant: tabular-nums;
		}
		.markdown-body td,
		.markdown-body th {
			padding: 0;
		} */

		.markdown-body details summary {
			cursor: pointer;
		}

		.markdown-body a:focus,
		.markdown-body [role="button"]:focus,
		.markdown-body input[type="radio"]:focus,
		.markdown-body input[type="checkbox"]:focus {
			outline: 2px solid var(--focus-outlineColor);
			outline-offset: -2px;
			box-shadow: none;
		}

		.markdown-body a:focus:not(:focus-visible),
		.markdown-body [role="button"]:focus:not(:focus-visible),
		.markdown-body input[type="radio"]:focus:not(:focus-visible),
		.markdown-body input[type="checkbox"]:focus:not(:focus-visible) {
			outline: solid 1px transparent;
		}

		.markdown-body a:focus-visible,
		.markdown-body [role="button"]:focus-visible,
		.markdown-body input[type="radio"]:focus-visible,
		.markdown-body input[type="checkbox"]:focus-visible {
			outline: 2px solid var(--focus-outlineColor);
			outline-offset: -2px;
			box-shadow: none;
		}

		.markdown-body a:not([class]):focus,
		.markdown-body a:not([class]):focus-visible,
		.markdown-body input[type="radio"]:focus,
		.markdown-body input[type="radio"]:focus-visible,
		.markdown-body input[type="checkbox"]:focus,
		.markdown-body input[type="checkbox"]:focus-visible {
			outline-offset: 0;
		}

		.markdown-body kbd {
			display: inline-block;
			padding: var(--base-size-4);
			font: 11px var(--fontStack-monospace, ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace);
			line-height: 10px;
			color: var(--fgColor-default);
			vertical-align: middle;
			background-color: var(--bgColor-muted);
			border: solid 1px var(--borderColor-neutral-muted);
			border-bottom-color: var(--borderColor-neutral-muted);
			border-radius: 10px;
			box-shadow: inset 0 -1px 0 var(--borderColor-neutral-muted);
		}

		.markdown-body h1,
		.markdown-body h2,
		.markdown-body h3,
		.markdown-body h4,
		.markdown-body h5,
		.markdown-body h6 {
			margin-top: var(--base-size-24);
			margin-bottom: var(--base-size-16);
			font-weight: var(--base-text-weight-semibold, 600);
			line-height: 1.25;
		}

		.markdown-body h2 {
			font-weight: var(--base-text-weight-semibold, 600);
			padding-bottom: 0.3em;
			font-size: 1.5em;
			border-bottom: 1px solid var(--borderColor-muted);
		}

		.markdown-body h3 {
			font-weight: var(--base-text-weight-semibold, 600);
			font-size: 1.25em;
		}

		.markdown-body h4 {
			font-weight: var(--base-text-weight-semibold, 600);
			font-size: 1em;
		}

		.markdown-body h5 {
			font-weight: var(--base-text-weight-semibold, 600);
			font-size: 0.875em;
		}

		.markdown-body h6 {
			font-weight: var(--base-text-weight-semibold, 600);
			font-size: 0.85em;
			color: var(--fgColor-muted);
		}

		.markdown-body p {
			margin-top: 0;
			margin-bottom: 10px;
		}

		.markdown-body blockquote {
			margin: 0;
			padding: 0 1em;
			color: var(--fgColor-muted);
			border-left: 0.25em solid var(--borderColor-default);
		}

		.markdown-body ul,
		.markdown-body ol {
			margin-top: 0;
			margin-bottom: 0;
			padding-left: 2em;
		}

		.markdown-body ol ol,
		.markdown-body ul ol {
			list-style-type: lower-roman;
		}

		.markdown-body ul ul ol,
		.markdown-body ul ol ol,
		.markdown-body ol ul ol,
		.markdown-body ol ol ol {
			list-style-type: lower-alpha;
		}

		.markdown-body dd {
			margin-left: 0;
		}

		.markdown-body tt,
		.markdown-body code,
		.markdown-body samp {
			font-family: "SFMono Nerd Font", "SF Mono", Menlo, monospace;
			font-size: 12px;
		}

		.markdown-body pre {
			margin: 1.5em;
			font-family: "SFMono Nerd Font", "SF Mono", Menlo, monospace;
			font-size: 12px;
			word-wrap: normal;
		}

		.markdown-body .octicon {
			display: inline-block;
			overflow: visible !important;
			vertical-align: text-bottom;
			fill: currentColor;
		}

		.markdown-body input::-webkit-outer-spin-button,
		.markdown-body input::-webkit-inner-spin-button {
			margin: 0;
			appearance: none;
		}

		.markdown-body .mr-2 {
			margin-right: var(--base-size-8, 8px) !important;
		}

		.markdown-body::before {
			display: table;
			content: "";
		}

		.markdown-body::after {
			display: table;
			clear: both;
			content: "";
		}

		.markdown-body>*:first-child {
			margin-top: 0 !important;
		}

		.markdown-body>*:last-child {
			margin-bottom: 0 !important;
		}

		.markdown-body a:not([href]) {
			color: inherit;
			text-decoration: none;
		}

		.markdown-body .absent {
			color: var(--fgColor-danger);
		}

		.markdown-body .anchor {
			float: left;
			padding-right: var(--base-size-4);
			margin-left: -20px;
			line-height: 1;
		}

		.markdown-body .anchor:focus {
			outline: none;
		}

		.markdown-body p,
		.markdown-body blockquote,
		.markdown-body ul,
		.markdown-body ol,
		.markdown-body dl,
		.markdown-body table,
		.markdown-body pre,
		.markdown-body details {
			margin-top: 0;
			margin-bottom: var(--base-size-16);
		}

		.markdown-body blockquote> :first-child {
			margin-top: 0;
		}

		.markdown-body blockquote> :last-child {
			margin-bottom: 0;
		}

		.markdown-body h1 .octicon-link,
		.markdown-body h2 .octicon-link,
		.markdown-body h3 .octicon-link,
		.markdown-body h4 .octicon-link,
		.markdown-body h5 .octicon-link,
		.markdown-body h6 .octicon-link {
			color: var(--fgColor-default);
			vertical-align: middle;
			visibility: hidden;
		}

		.markdown-body h1:hover .anchor,
		.markdown-body h2:hover .anchor,
		.markdown-body h3:hover .anchor,
		.markdown-body h4:hover .anchor,
		.markdown-body h5:hover .anchor,
		.markdown-body h6:hover .anchor {
			text-decoration: none;
		}

		.markdown-body h1:hover .anchor .octicon-link,
		.markdown-body h2:hover .anchor .octicon-link,
		.markdown-body h3:hover .anchor .octicon-link,
		.markdown-body h4:hover .anchor .octicon-link,
		.markdown-body h5:hover .anchor .octicon-link,
		.markdown-body h6:hover .anchor .octicon-link {
			visibility: visible;
		}

		.markdown-body h1 tt,
		.markdown-body h1 code,
		.markdown-body h2 tt,
		.markdown-body h2 code,
		.markdown-body h3 tt,
		.markdown-body h3 code,
		.markdown-body h4 tt,
		.markdown-body h4 code,
		.markdown-body h5 tt,
		.markdown-body h5 code,
		.markdown-body h6 tt,
		.markdown-body h6 code {
			padding: 0 0.2em;
			font-size: inherit;
		}

		.markdown-body summary h1,
		.markdown-body summary h2,
		.markdown-body summary h3,
		.markdown-body summary h4,
		.markdown-body summary h5,
		.markdown-body summary h6 {
			display: inline-block;
		}

		.markdown-body summary h1 .anchor,
		.markdown-body summary h2 .anchor,
		.markdown-body summary h3 .anchor,
		.markdown-body summary h4 .anchor,
		.markdown-body summary h5 .anchor,
		.markdown-body summary h6 .anchor {
			margin-left: -40px;
		}

		.markdown-body summary h1,
		.markdown-body summary h2 {
			padding-bottom: 0;
			border-bottom: 0;
		}

		.markdown-body ul.no-list,
		.markdown-body ol.no-list {
			padding: 0;
			list-style-type: none;
		}

		.markdown-body ol[type="a s"] {
			list-style-type: lower-alpha;
		}

		.markdown-body ol[type="A s"] {
			list-style-type: upper-alpha;
		}

		.markdown-body ol[type="i s"] {
			list-style-type: lower-roman;
		}

		.markdown-body ol[type="I s"] {
			list-style-type: upper-roman;
		}

		.markdown-body ol[type="1"] {
			list-style-type: decimal;
		}

		.markdown-body div>ol:not([type]) {
			list-style-type: decimal;
		}

		.markdown-body ul ul,
		.markdown-body ul ol,
		.markdown-body ol ol,
		.markdown-body ol ul {
			margin-top: 0;
			margin-bottom: 0;
		}

		.markdown-body li>p {
			margin-top: var(--base-size-16);
		}

		.markdown-body li+li {
			margin-top: 0.25em;
		}

		.markdown-body dl {
			padding: 0;
		}

		.markdown-body dl dt {
			padding: 0;
			margin-top: var(--base-size-16);
			font-size: 1em;
			font-style: italic;
			font-weight: var(--base-text-weight-semibold, 600);
		}

		.markdown-body dl dd {
			padding: 0 var(--base-size-16);
			margin-bottom: var(--base-size-16);
		}

		.markdown-body table th {
			font-weight: var(--base-text-weight-semibold, 600);
		}

		.markdown-body table th,
		.markdown-body table td {
			padding: 6px 13px;
			border: 0px solid var(--borderColor-default);
		}

		.markdown-body table td> :last-child {
			margin-bottom: 0;
		}

		.markdown-body table tr {
			font-family: "Satoshi Nerd Font", sans-serif;
			background-color: var(--bgColor-default);
			border-top: 1px solid var(--borderColor-muted);
		}

		.markdown-body table tr:nth-child(2n) {
			background-color: var(--bgColor-muted);
		}

		.markdown-body table img {
			background-color: transparent;
		}

		.markdown-body img[align="right"] {
			padding-left: 20px;
		}

		.markdown-body img[align="left"] {
			padding-right: 20px;
		}

		.markdown-body .emoji {
			max-width: none;
			vertical-align: text-top;
			background-color: transparent;
		}

		.markdown-body span.frame {
			display: block;
			overflow: hidden;
		}

		.markdown-body span.frame>span {
			display: block;
			float: left;
			width: auto;
			padding: 7px;
			margin: 13px 0 0;
			overflow: hidden;
			border: 1px solid var(--borderColor-default);
		}

		.markdown-body span.frame span img {
			display: block;
			float: left;
		}

		.markdown-body span.frame span span {
			display: block;
			padding: 5px 0 0;
			clear: both;
			color: var(--fgColor-default);
		}

		.markdown-body span.align-center {
			display: block;
			overflow: hidden;
			clear: both;
		}

		.markdown-body span.align-center>span {
			display: block;
			margin: 13px auto 0;
			overflow: hidden;
			text-align: center;
		}

		.markdown-body span.align-center span img {
			margin: 0 auto;
			text-align: center;
		}

		.markdown-body span.align-right {
			display: block;
			overflow: hidden;
			clear: both;
		}

		.markdown-body span.align-right>span {
			display: block;
			margin: 13px 0 0;
			overflow: hidden;
			text-align: right;
		}

		.markdown-body span.align-right span img {
			margin: 0;
			text-align: right;
		}

		.markdown-body span.float-left {
			display: block;
			float: left;
			margin-right: 13px;
			overflow: hidden;
		}

		.markdown-body span.float-left span {
			margin: 13px 0 0;
		}

		.markdown-body span.float-right {
			display: block;
			float: right;
			margin-left: 13px;
			overflow: hidden;
		}

		.markdown-body span.float-right>span {
			display: block;
			margin: 13px auto 0;
			overflow: hidden;
			text-align: right;
		}

		.markdown-body code,
		.markdown-body tt {
			padding: 0.2em 0.4em;
			margin: 0;
			font-size: 85%;
			white-space: break-spaces;
			background-color: var(--bgColor-neutral-muted);
			border-radius: 7px;
		}

		.markdown-body code br,
		.markdown-body tt br {
			display: none;
		}

		.markdown-body del code {
			text-decoration: inherit;
		}

		.markdown-body samp {
			font-size: 85%;
		}

		pre {
			cursor: crosshair;
			margin-left: 1.5em;
			margin-right: 1.5em;
		}

		.markdown-body pre code {
			font-size: 95%;
		}

		.markdown-body pre>code {
			padding: 0;
			margin: 0;
			word-break: normal;
			white-space: pre;
			background: transparent;
			border: 0;
		}

		.markdown-body .highlight {
			margin-bottom: var(--base-size-16);
		}

		.markdown-body .highlight pre {
			margin-bottom: 0;
			word-break: normal;
		}

		.markdown-body .highlight pre,
		.markdown-body pre {
			padding: var(--base-size-16);
			overflow: auto;
			font-size: 85%;
			line-height: 1.4;
			color: var(--fgColor-default);
			background-color: #09090a;
			border-radius: 10px;
			box-shadow:
				0 10px 16px 0 rgba(0, 0, 0, 0.2),
				0 6px 20px 0 rgba(0, 0, 0, 0.19) !important;
		}

		.markdown-body pre code,
		.markdown-body pre tt {
			display: inline;
			max-width: auto;
			padding: 0;
			margin: 0;
			overflow: visible;
			line-height: inherit;
			word-wrap: normal;
			background-color: transparent;
			border: 0;
		}

		.markdown-body .csv-data td,
		.markdown-body .csv-data th {
			padding: 5px;
			overflow: hidden;
			font-size: 12px;
			line-height: 1;
			text-align: left;
			white-space: nowrap;
		}

		.markdown-body .csv-data .blob-num {
			padding: 10px var(--base-size-8) 9px;
			text-align: right;
			background: var(--bgColor-default);
			border: 0;
		}

		.markdown-body .csv-data tr {
			border-top: 0;
		}

		.markdown-body .csv-data th {
			font-weight: var(--base-text-weight-semibold, 600);
			background: var(--bgColor-muted);
			border-top: 0;
		}

		.markdown-body [data-footnote-ref]::before {
			content: "[";
		}

		.markdown-body [data-footnote-ref]::after {
			content: "]";
		}

		.markdown-body .footnotes {
			font-size: 12px;
			color: var(--fgColor-muted);
			border-top: 1px solid var(--borderColor-default);
		}

		.markdown-body .footnotes ol {
			padding-left: var(--base-size-16);
		}

		.markdown-body .footnotes ol ul {
			display: inline-block;
			padding-left: var(--base-size-16);
			margin-top: var(--base-size-16);
		}

		.markdown-body .footnotes li {
			position: relative;
		}

		.markdown-body .footnotes li:target::before {
			position: absolute;
			top: calc(var(--base-size-8) * -1);
			right: calc(var(--base-size-8) * -1);
			bottom: calc(var(--base-size-8) * -1);
			left: calc(var(--base-size-24) * -1);
			pointer-events: none;
			content: "";
			border: 2px solid var(--borderColor-accent-emphasis);
			border-radius: 6px;
		}

		.markdown-body .footnotes li:target {
			color: var(--fgColor-default);
		}

		.markdown-body .footnotes .data-footnote-backref g-emoji {
			font-family: monospace;
		}

		.markdown-body body:has(:modal) {
			padding-right: var(--dialog-scrollgutter) !important;
		}

		.markdown-body .pl-c {
			color: var(--color-prettylights-syntax-comment);
		}

		.markdown-body .pl-c1,
		.markdown-body .pl-s .pl-v {
			color: var(--color-prettylights-syntax-constant);
		}

		.markdown-body .pl-e,
		.markdown-body .pl-en {
			color: var(--color-prettylights-syntax-entity);
		}

		.markdown-body .pl-smi,
		.markdown-body .pl-s .pl-s1 {
			color: var(--color-prettylights-syntax-storage-modifier-import);
		}

		.markdown-body .pl-ent {
			color: var(--color-prettylights-syntax-entity-tag);
		}

		.markdown-body .pl-k {
			color: var(--color-prettylights-syntax-keyword);
		}

		.markdown-body .pl-s,
		.markdown-body .pl-pds,
		.markdown-body .pl-s .pl-pse .pl-s1,
		.markdown-body .pl-sr,
		.markdown-body .pl-sr .pl-cce,
		.markdown-body .pl-sr .pl-sre,
		.markdown-body .pl-sr .pl-sra {
			color: var(--color-prettylights-syntax-string);
		}

		.markdown-body .pl-v,
		.markdown-body .pl-smw {
			color: var(--color-prettylights-syntax-variable);
		}

		.markdown-body .pl-bu {
			color: var(--color-prettylights-syntax-brackethighlighter-unmatched);
		}

		.markdown-body .pl-ii {
			color: var(--color-prettylights-syntax-invalid-illegal-text);
			background-color: var(--color-prettylights-syntax-invalid-illegal-bg);
		}

		.markdown-body .pl-c2 {
			color: var(--color-prettylights-syntax-carriage-return-text);
			background-color: var(--color-prettylights-syntax-carriage-return-bg);
		}

		.markdown-body .pl-sr .pl-cce {
			font-weight: bold;
			color: var(--color-prettylights-syntax-string-regexp);
		}

		.markdown-body .pl-ml {
			color: var(--color-prettylights-syntax-markup-list);
		}

		.markdown-body .pl-mh,
		.markdown-body .pl-mh .pl-en,
		.markdown-body .pl-ms {
			font-weight: bold;
			color: var(--color-prettylights-syntax-markup-heading);
		}

		.markdown-body .pl-mi {
			font-style: italic;
			color: var(--color-prettylights-syntax-markup-italic);
		}

		.markdown-body .pl-mb {
			font-weight: bold;
			color: var(--color-prettylights-syntax-markup-bold);
		}

		.markdown-body .pl-md {
			color: var(--color-prettylights-syntax-markup-deleted-text);
			background-color: var(--color-prettylights-syntax-markup-deleted-bg);
		}

		.markdown-body .pl-mi1 {
			color: var(--color-prettylights-syntax-markup-inserted-text);
			background-color: var(--color-prettylights-syntax-markup-inserted-bg);
		}

		.markdown-body .pl-mc {
			color: var(--color-prettylights-syntax-markup-changed-text);
			background-color: var(--color-prettylights-syntax-markup-changed-bg);
		}

		.markdown-body .pl-mi2 {
			color: var(--color-prettylights-syntax-markup-ignored-text);
			background-color: var(--color-prettylights-syntax-markup-ignored-bg);
		}

		.markdown-body .pl-mdr {
			font-weight: bold;
			color: var(--color-prettylights-syntax-meta-diff-range);
		}

		.markdown-body .pl-by {
			color: var(--color-prettylights-syntax-brackethighlighter-angle);
		}

		.markdown-body .pl-sg {
			color: var(--color-prettylights-syntax-sublimelinter-gutter-mark);
		}

		.markdown-body .pl-corl {
			text-decoration: underline;
			color: var(--color-prettylights-syntax-constant-other-reference-link);
		}

		.markdown-body [role="button"]:focus:not(:focus-visible),
		.markdown-body [role="tabpanel"][tabindex="0"]:focus:not(:focus-visible),
		.markdown-body button:focus:not(:focus-visible),
		.markdown-body summary:focus:not(:focus-visible),
		.markdown-body a:focus:not(:focus-visible) {
			outline: none;
			box-shadow: none;
		}

		.markdown-body [tabindex="0"]:focus:not(:focus-visible),
		.markdown-body details-dialog:focus:not(:focus-visible) {
			outline: none;
		}

		.markdown-body g-emoji {
			display: inline-block;
			min-width: 1ch;
			font-family: "Apple Color Emoji", "Symbols Nerd Font", "Segoe UI Symbol";
			font-size: 1em;
			font-style: normal !important;
			font-weight: var(--base-text-weight-normal, 400);
			line-height: 1;
			vertical-align: -0.075em;
		}

		.markdown-body g-emoji img {
			width: 1em;
			height: 1em;
		}

		.markdown-body .task-list-item {
			list-style-type: none;
		}

		.markdown-body .task-list-item label {
			font-weight: var(--base-text-weight-normal, 400);
		}

		.markdown-body .task-list-item.enabled label {
			cursor: pointer;
		}

		/* END OF MAIN CSS */

		/* Copy button container */
		.code-wrapper {
			position: relative;
		}

		.copy-button {
			position: absolute;
			top: 8px;
			right: 30px;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			padding: 6px;
			background: #09090a;
			border: 1px solid #09090a;
			border-radius: 4px;
			color: #7b98da;
			opacity: 0.6;
			font-size: large;
			z-index: 10;
			transition: all 1s ease;
		}

		.copy-button:hover {
			color: #f5d49e;
			border-color: transparent;
			opacity: 1;
			font-size: x-large;
		}

		/* SVG icon styles */
		.copy-button svg {
			cursor: crosshair;
			width: 19px;
			height: 19px;
			stroke: #f5d49e;
			opacity: 0.4;
			transition: all 0.5s ease;
			transform-origin: center;
		}

		.copy-button:hover svg {
			opacity: 0.97;
			fill: #f5d49e;
			transform: scale(1.25);
		}

		/* Tooltip styles */
		.copy-button[data-tooltip]::before {
			content: attr(data-tooltip);
			position: absolute;
			bottom: 100%;
			right: 0;
			margin-bottom: 8px;
			padding: 4px 8px;
			background: #1a202c;
			color: #bbbbbb;
			font-size: 9px;
			white-space: nowrap;
			border-radius: 6px;
			opacity: 0.4;
			visibility: hidden;
			transition: all 0.6s ease;
		}

		.copy-button[data-tooltip]:hover::before {
			opacity: 1;
			visibility: visible;
		}

		/* Success state */
		.copy-button.copied {
			border-color: #b5f700;
			transition: all 0.6s ease;
		}

		.copy-button.copied svg {
			stroke: #b5f700;
		}

		/* Ensure pre tags have relative positioning for button placement */
		pre {
			position: relative;
			padding-top: 1.25rem !important;
			padding-left: 1.75em !important;
		}

		.language-label {
			position: absolute;
			top: 15px;
			right: 60px;
			background: #09090a;
			font-size: 12px;
			font-family: Satoshi, Author, "SF Pro Display";
			border-radius: 0 4px 0 4px;
			opacity: 0.4;
			color: #f5d49e;
			cursor: pointer;
		}

		.language-label:hover {
			opacity: 0.8;
		}

		/* END OF CLIPB CSS */

		/* Base callout styling */
		.callout {
			padding: 0;
			margin-bottom: 16px;
			border-left: 4px solid #d0d7de;
			border-radius: 8px;
			overflow: hidden;
		}

		.callout-header {
			padding: 8px 16px;
			display: flex;
			align-items: center;
			font-weight: 600;
		}

		.callout-icon {
			margin-right: 8px;
		}

		.callout-content {
			padding: 0 16px 16px;
		}

		.callout-content p {
			margin: 0;
		}

		/* Specific callout types */
		.callout-note {
			border-left-color: #0969da;
			background: #171b29;
		}

		.callout-note .callout-header {
			color: #0969da;
		}

		.callout-tip {
			border-left-color: #1a7f37;
			background: #121e1d;
		}

		.callout-tip .callout-header {
			color: #1a7f37;
		}

		.callout-important {
			border-left-color: #8250df;
			background: #1b192a;
		}

		.callout-important .callout-header {
			color: #8250df;
		}

		.callout-warning {
			border-left-color: #9a6700;
			background: #24201a;
		}

		.callout-warning .callout-header {
			color: #9a6700;
		}

		.callout-caution {
			border-left-color: #cf222e;
			background: #26181c;
		}

		.callout-caution .callout-header {
			color: #cf222e;
		}

		/* END OF CALLOUTS CSS */

		::selection {
			background-color: #91919130;
			/* Change to your preferred color */
			/* color: #000000; Text color when highlighted */
		}

		::-moz-selection {
			/* Firefox requires its own rule */
			background-color: #91919130;
			/* color: #000000; */
		}

		/* END OF EXTRAS CSS */
	</style>
</head>

<body>
	<script type="text/javascript" src="https://cdn.jsdelivr.net/gh/limpdev/limpbin@main/css/prismHL.js"></script>
	<article class="markdown-body">{{CONTENT}}</article>
	<script type="text/javascript">
		// clipb.js
		// Module for adding copy buttons to code blocks
		const ClipbModule = (() => {
			// Function to create and return the copy button
			const createCopyButton = () => {
				const copyButton = document.createElement("button");
				const dBolt = "M4 14L14 3v7h6L10 21v-7z";
				copyButton.className = "copy-button";
				copyButton.innerHTML =
					`<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24"><path d="${dBolt}"/></svg>`;
				return copyButton;
			};
			// Function to add a copy button to a single code block
			const addCopyButton = (codeBlock) => {
				// Get the parent pre element
				const preElement = codeBlock.closest("pre");
				if (!preElement) return; // Skip if not inside a pre element
				// Check if already wrapped
				if (preElement.parentElement.classList.contains("code-wrapper")) return;
				// Create a wrapper div for the code block
				const wrapper = document.createElement("div");
				wrapper.className = "code-wrapper";
				// Create the copy button
				const button = createCopyButton();
				// Insert the wrapper before the pre element
				preElement.parentNode.insertBefore(wrapper, preElement);
				// Move the pre element inside the wrapper
				wrapper.appendChild(preElement);
				// Add the button to the wrapper
				wrapper.insertBefore(button, preElement);
				// Add event listener for copy functionality
				button.addEventListener("click", () => {
					// Get text content, handling highlighted code
					const textToCopy = codeBlock.textContent || codeBlock.innerText;
					navigator.clipboard.writeText(textToCopy).then(
						() => {
							const successSVG = `
			            <svg viewBox="0 0 24 24" width="1.5em" height="1.5em" fill="green">
			              <path d="M10 2a3 3 0 0 0-2.83 2H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3h-1.17A3 3 0 0 0 14 2zM9 5a1 1 0 0 1 1-1h4a1 1 0 1 1 0 2h-4a1 1 0 0 1-1-1m6.78 6.625a1 1 0 1 0-1.56-1.25l-3.303 4.128l-1.21-1.21a1 1 0 0 0-1.414 1.414l2 2a1 1 0 0 0 1.488-.082l4-5z"></path>
			            </svg>
			          `;
							button.innerHTML = successSVG; // Set success SVG
							setTimeout(() => {
								const defaultSVG = `
			              <svg viewBox="0 0 24 24" width="1.5em" height="1.5em" fill="currentColor">
			                <path d="M4 14L14 3v7h6L10 21v-7z"></path>
			              </svg>
			            `;
								button.innerHTML = defaultSVG; // Revert to default SVG
							}, 2000);
						},
						(err) => {
							console.error("Could not copy text: ", err);
						},
					);
				});
			};
			// Function to add copy buttons to all code blocks on the page
			const addCopyButtons = () => {
				// Target all code blocks inside pre elements, including those with hljs class
				const codeBlocks = document.querySelectorAll("pre code, pre.hljs code");
				codeBlocks.forEach(addCopyButton);
			};
			// MutationObserver callback to handle dynamically added code blocks
			const handleMutations = (mutations) => {
				mutations.forEach((mutation) => {
					mutation.addedNodes.forEach((node) => {
						if (node.nodeType === 1) {
							// Element node
							// Check if the node itself is a pre with code
							if (node.matches("pre") && node.querySelector("code")) {
								addCopyButton(node.querySelector("code"));
							}
							// Check for any code blocks within the added node
							else {
								const nestedCodeBlocks = node.querySelectorAll(
									"pre code, pre.hljs code");
								nestedCodeBlocks.forEach(addCopyButton);
							}
						}
					});
				});
			};
			// Initialize the module
			const init = () => {
				// Wait for the DOM to be fully loaded
				if (document.readyState === "loading") {
					document.addEventListener("DOMContentLoaded", addCopyButtons);
				} else {
					addCopyButtons();
				}
				// Set up observer for dynamically added elements
				const observer = new MutationObserver(handleMutations);
				observer.observe(document.body, {
					childList: true,
					subtree: true,
				});
			};
			// Public API
			return {
				init
			};
		})();
		// Auto-initialize if script is loaded directly
		if (typeof window !== "undefined") {
			window.addEventListener("DOMContentLoaded", ClipbModule.init);
		}
		/**
		 * Converts GitHub-style markdown callouts to HTML callouts within existing HTML blockquotes
		 */
		function convertMarkdownCalloutsToHtml(htmlText) {
			// Define callout types and their icons
			const calloutTypes = {
				NOTE: '<i class="fas fa-info-circle"></i>',
				TIP: '<i class="fas fa-lightbulb"></i>',
				IMPORTANT: '<i class="fas fa-exclamation-circle"></i>',
				WARNING: '<i class="fas fa-exclamation-triangle"></i>',
				CAUTION: '<i class="fas fa-fire"></i>',
			};
			// Regex to match GitHub-style callouts inside blockquotes in HTML
			// Matches: <blockquote><p>[!TYPE] ... </p></blockquote>
			const calloutRegex =
				/<blockquote>\s*<p>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*([\s\S]*?)<\/p>\s*<\/blockquote>/gm;

			return htmlText.replace(calloutRegex, function (match, type, content) {
				// Normalize the type to handle case variations
				const normalizedType = type.toUpperCase();
				// Make sure we have a valid type, or default to NOTE
				const calloutType = Object.keys(calloutTypes).includes(normalizedType) ? normalizedType : "NOTE";
				// Process the content - trim whitespace
				const processedContent = content.trim();
				// Build the HTML replacement
				return `<div class="callout callout-${calloutType.toLowerCase()}">
      <div class="callout-header">
        <span class="callout-icon">${calloutTypes[calloutType]}</span>
        <span class="callout-title">${calloutType}</span>
      </div>
      <div class="callout-content">
        <p>${processedContent}</p>
      </div>
    </div>`;
			});
		}

		// MARK TAGS FOR TEXT - AKA, Highlighting!
		function addMarkTags(text) {
			// Replace text wrapped between == and == with <mark> tags
			// This regex finds any text between =: and := regardless of its location
			const markRegex = /==(.*?)==/g;
			const markReplace = (match, content) => {
				return `<mark>${content}</mark>`;
			};
			return text.replace(markRegex, markReplace);
		}

		document.addEventListener("DOMContentLoaded", function () {
			// Get the current HTML content of the body
			let bodyHTML = document.body.innerHTML;
			// First apply the mark tags (highlighting)
			bodyHTML = addMarkTags(bodyHTML);
			// Then convert the markdown callouts
			bodyHTML = convertMarkdownCalloutsToHtml(bodyHTML);
			// Replace the body's HTML with the converted content
			document.body.innerHTML = bodyHTML;
		});

		// Add ripple effect for every mouse click, anywhere on the page using an SVG
		document.addEventListener("click", function (e) {
			// Create a container for the ripple effect
			const rippleContainer = document.createElement("div");
			rippleContainer.style.position = "fixed";
			rippleContainer.style.left = e.clientX - 48 + "px"; // Center the ripple at click position
			rippleContainer.style.top = e.clientY - 48 + "px";
			rippleContainer.style.pointerEvents = "none"; // Don't interfere with further clicks
			rippleContainer.style.zIndex = "9999";
			// Create SVG element
			const svgNS = "http://www.w3.org/2000/svg";
			const svg = document.createElementNS(svgNS, "svg");
			svg.setAttribute("width", "96");
			svg.setAttribute("height", "96");
			svg.setAttribute("viewBox", "0 0 24 24");
			// Create circle element
			const circle = document.createElementNS(svgNS, "circle");
			circle.setAttribute("cx", "12");
			circle.setAttribute("cy", "12");
			circle.setAttribute("r", "0");
			circle.setAttribute("fill", "rgba(168, 168, 168, 0.5)");
			// Create animate elements
			const animateRadius = document.createElementNS(svgNS, "animate");
			animateRadius.setAttribute("attributeName", "r");
			animateRadius.setAttribute("calcMode", "spline");
			animateRadius.setAttribute("dur", "0.5s");
			animateRadius.setAttribute("keySplines", ".52,.6,.25,.99");
			animateRadius.setAttribute("values", "0;11");
			animateRadius.setAttribute("fill", "freeze");
			const animateOpacity = document.createElementNS(svgNS, "animate");
			animateOpacity.setAttribute("attributeName", "opacity");
			animateOpacity.setAttribute("calcMode", "spline");
			animateOpacity.setAttribute("dur", "0.5s");
			animateOpacity.setAttribute("keySplines", ".52,.6,.25,.99");
			animateOpacity.setAttribute("values", "1;0");
			animateOpacity.setAttribute("fill", "freeze");
			// Assemble the SVG
			circle.appendChild(animateRadius);
			circle.appendChild(animateOpacity);
			svg.appendChild(circle);
			rippleContainer.appendChild(svg);
			// Add to document
			document.body.appendChild(rippleContainer);
			// Remove after animation completes
			setTimeout(() => {
				document.body.removeChild(rippleContainer);
			}, 500); // Match the duration of the animation
		});
	</script>
</body>

</html>
```

</details>

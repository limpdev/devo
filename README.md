# Summarized Repository  `devodocs`

Below is a full listing of each file ending 'go', 'jsx', and 'html'. Aside from JSON config files, these contents represent the bulk of the project's core logic.

## `app.go`

```go
// app.go
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"       // For file operations
	"path/filepath" // For path manipulation
	"runtime"
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

// OpenFolder   CONTENT PATH
func (a *App) OpenFolder(path string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("explorer", path)
	case "darwin":
		cmd = exec.Command("open", path)
	case "linux":
		cmd = exec.Command("xdg-open", path)
	default:
		return fmt.Errorf("unsupported platform")
	}
	return cmd.Start()
}
```

## `bookParser.go`

```go
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

```js
// frontend/src/App.jsx
import { useState, useEffect, useCallback } from 'react'
import * as runtime from '../wailsjs/runtime/runtime'
import { Icon } from '@iconify/react'
// Import markdown-it instead of remark
import MarkdownIt from 'markdown-it'
import markdownItAnchor from 'markdown-it-anchor'
import markdownItHighlight from 'markdown-it-highlightjs'
import { container } from '@mdit/plugin-container'
import { katex } from '@mdit/plugin-katex'
import { mark } from '@mdit/plugin-mark'
import { sub } from '@mdit/plugin-sub'
import { sup } from '@mdit/plugin-sup'
import { tab } from '@mdit/plugin-tab'
import { align } from '@mdit/plugin-align'
import { spoiler } from '@mdit/plugin-spoiler'
// Import Go functions
import { GetBookData, GetMarkdownContent } from '../wailsjs/go/main/App'
import { BrowserOpenURL } from '../wailsjs/runtime/runtime'

import TableOfContents from './components/TableOfContents'
import './App.css'

// --- Custom JS Logic (Integrated) ---

// WIP - COPY BUTTONS FOR CODEBLOCKS
function addCopyButtonsToCodeBlocks (containerElement) {
  if (!containerElement) return

  const preElements = containerElement.querySelectorAll('pre')

  preElements.forEach(preEl => {
    // Avoid re-wrapping if already processed (e.g., by a hot reload or manual call)
    if (
      preEl.parentElement &&
      preEl.parentElement.classList.contains('code-wrapper')
    ) {
      return
    }

    const codeEl = preEl.querySelector('code')
    if (!codeEl) return // Only add buttons to pre tags containing code

    const wrapperDiv = document.createElement('div')
    wrapperDiv.className = 'code-wrapper' // You'll style this with position: relative

    const copyButton = document.createElement('button')
    copyButton.className = 'clip-button' // Your existing or new class for styling
    copyButton.setAttribute('aria-label', 'Copy to clipboard')
    copyButton.setAttribute('title', 'Copy to clipboard')

    // Initial SVG icon for the copy button (simple clipboard)
    copyButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                <path d="M4 14L14 3v7h6L10 21v-7z"/>
            </svg>
        `

    // DOM manipulation:
    // Insert wrapper before the pre element
    preEl.parentNode.insertBefore(wrapperDiv, preEl)
    // Append the copy button to the wrapper
    wrapperDiv.appendChild(copyButton)
    // Move the pre element inside the wrapper
    wrapperDiv.appendChild(preEl)

    // Optional: Add language label (if you want it, like in templates/index.html)
    const language = codeEl.className.match(/language-(\w+)/)
    if (language && language[1]) {
      const langLabel = document.createElement('span')
      langLabel.className = 'language-label'
      langLabel.textContent = language[1]
      wrapperDiv.insertBefore(langLabel, preEl) // Or append to wrapperDiv
    }
  })
}

// Logic for handling clicks on dynamically added copy buttons
function setupCopyButtonListeners (containerElement) {
  if (!containerElement) return []

  // UPDATED selector to find buttons within the new wrapper
  const buttons = containerElement.querySelectorAll(
    '.code-wrapper .clip-button'
  )
  const listeners = []

  buttons.forEach(button => {
    // UPDATED logic to find the code block
    const wrapper = button.closest('.code-wrapper')
    const pre = wrapper ? wrapper.querySelector('pre') : null
    const codeBlock = pre ? pre.querySelector('code') : null

    if (!codeBlock) {
      console.warn(
        'Copy button found without a corresponding code block.',
        button
      )
      return
    }

    const clickHandler = async () => {
      try {
        await navigator.clipboard.writeText(codeBlock.innerText)

        const svg = button.querySelector('svg')
        if (!svg) return

        const originalViewBox = svg.getAttribute('viewBox')
        const originalWidth = svg.getAttribute('width')
        const originalHeight = svg.getAttribute('height')
        const originalFill = svg.getAttribute('fill')
        const originalHtml = svg.innerHTML
        const originalAriaLabel = button.getAttribute('aria-label')
        const originalTitle = button.getAttribute('title')

        svg.innerHTML = ''
        svg.setAttribute('viewBox', '0 0 24 24') // Standard checkmark viewBox
        // Keep existing width/height or set explicitly if needed
        // svg.setAttribute("width", "16");
        // svg.setAttribute("height", "16");
        svg.setAttribute('fill', 'var(--hl-green, green)')

        const successPath = document.createElementNS(
          'http://www.w3.org/2000/svg',
          'path'
        )
        successPath.setAttribute(
          'd',
          'M10 2a3 3 0 0 0-2.83 2H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3h-1.17A3 3 0 0 0 14 2zM9 5a1 1 0 0 1 1-1h4a1 1 0 1 1 0 2h-4a1 1 0 0 1-1-1m6.78 6.625a1 1 0 1 0-1.56-1.25l-3.303 4.128l-1.21-1.21a1 1 0 0 0-1.414 1.414l2 2a1 1 0 0 0 1.488-.082l4-5z'
        )
        svg.appendChild(successPath)
        button.setAttribute('aria-label', 'Copied!')
        button.setAttribute('title', 'Copied!')
        button.classList.add('copied')

        setTimeout(() => {
          svg.innerHTML = originalHtml
          if (originalViewBox) svg.setAttribute('viewBox', originalViewBox)
          else svg.removeAttribute('viewBox')
          if (originalWidth) svg.setAttribute('width', originalWidth)
          else svg.removeAttribute('width')
          if (originalHeight) svg.setAttribute('height', originalHeight)
          else svg.removeAttribute('height')
          if (originalFill) svg.setAttribute('fill', originalFill)
          else svg.removeAttribute('fill')
          button.setAttribute(
            'aria-label',
            originalAriaLabel || 'Copy to clipboard'
          )
          button.setAttribute('title', originalTitle || 'Copy to clipboard')
          button.classList.remove('copied')
        }, 2000)
      } catch (err) {
        console.error('Failed to copy code:', err)
        const originalAriaLabel = button.getAttribute('aria-label') // Capture before changing
        const originalTitle = button.getAttribute('title')
        button.setAttribute('aria-label', 'Copy failed!')
        button.setAttribute('title', 'Copy failed!')
        setTimeout(() => {
          // Revert error message after a bit
          button.setAttribute(
            'aria-label',
            originalAriaLabel || 'Copy to clipboard'
          )
          button.setAttribute('title', originalTitle || 'Copy to clipboard')
        }, 2000)
      }
    }

    button.addEventListener('click', clickHandler)
    listeners.push({ element: button, type: 'click', handler: clickHandler })
  })

  return listeners
}

// WORKS - Ripple Effect
function handleGlobalClickForRipple (e) {
  // Ignore clicks on buttons or interactive elements if desired
  if (e.target.closest('button, a, input, select, textarea')) {
    return
  }

  const rippleContainer = document.createElement('div')
  rippleContainer.style.position = 'fixed'
  rippleContainer.style.left = e.clientX - 48 + 'px' // Center 96x96 svg
  rippleContainer.style.top = e.clientY - 48 + 'px'
  rippleContainer.style.pointerEvents = 'none'
  rippleContainer.style.zIndex = '9999'
  rippleContainer.style.width = '96px'
  rippleContainer.style.height = '96px'
  rippleContainer.style.overflow = 'hidden' // Contain ripple if needed

  const svgNS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(svgNS, 'svg')
  svg.setAttribute('width', '96')
  svg.setAttribute('height', '96')
  svg.setAttribute('viewBox', '0 0 24 24')

  const circle = document.createElementNS(svgNS, 'circle')
  circle.setAttribute('cx', '12')
  circle.setAttribute('cy', '12')
  circle.setAttribute('r', '0')
  // Use a CSS variable or a default color for the ripple
  circle.setAttribute('fill', 'var(--ripple-color, rgba(168, 168, 168, 0.7))')
  circle.style.opacity = '0.7' // Start fully opaque

  // Create animate elements
  const animateRadius = document.createElementNS(svgNS, 'animate')
  animateRadius.setAttribute('attributeName', 'r')
  animateRadius.setAttribute('calcMode', 'spline')
  animateRadius.setAttribute('dur', '0.4s')
  animateRadius.setAttribute('keySplines', '.52,.6,.25,.99')
  animateRadius.setAttribute('values', '0;11')
  animateRadius.setAttribute('fill', 'freeze')
  const animateOpacity = document.createElementNS(svgNS, 'animate')
  animateOpacity.setAttribute('attributeName', 'opacity')
  animateOpacity.setAttribute('calcMode', 'spline')
  animateOpacity.setAttribute('dur', '0.4s')
  animateOpacity.setAttribute('keySplines', '.52,.6,.25,.99')
  animateOpacity.setAttribute('values', '1;0')
  animateOpacity.setAttribute('fill', 'freeze')
  // Assemble the SVG
  circle.appendChild(animateRadius)
  circle.appendChild(animateOpacity)
  svg.appendChild(circle)
  rippleContainer.appendChild(svg)
  // Append the ripple container to the body
  document.body.appendChild(rippleContainer)

  // Remove after animation completes (adjust time if animation duration changes)
  setTimeout(() => {
    if (document.body.contains(rippleContainer)) {
      document.body.removeChild(rippleContainer)
    }
  }, 600) // A bit longer than animation duration
}

// --- REACT COMPONENT ---
// Initialize markdown-it with plugins
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true
})
  .use(markdownItAnchor, {
    permalink: true,
    permalinkSymbol: ' 󰓼',
    permalinkSpace: false
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
    name: 'warning',
    openRender: (tokens, index, _options) => {
      const token = tokens[index]
      if (token.nesting === 1) {
        return `<div class="custom-block warning"><em class="custom-block-title"> Warning</em>\n`
      } else {
        return `</div>\n`
      }
    }
  })
  .use(container, {
    name: 'caution',
    openRender: (tokens, index, _options) => {
      const token = tokens[index]
      if (token.nesting === 1) {
        return `<div class="custom-block caution"><em class="custom-block-title"> Caution</em>\n`
      } else {
        return `</div>\n`
      }
    }
  })
  .use(container, {
    name: 'tip',
    openRender: (tokens, index, _options) => {
      const token = tokens[index]
      if (token.nesting === 1) {
        return `<div class="custom-block tip"><em class="custom-block-title"> Tip</em>\n`
      } else {
        return `</div>\n`
      }
    }
  })
  .use(container, {
    name: 'note',
    openRender: (tokens, index, _options) => {
      const token = tokens[index]
      if (token.nesting === 1) {
        return `<div class="custom-block note"><em class="custom-block-title"> Note</em>\n`
      } else {
        return `</div>\n`
      }
    }
  })
  .use(container, {
    name: 'hint',
    openRender: (tokens, index, _options) => {
      const token = tokens[index]
      if (token.nesting === 1) {
        return `<div class="custom-block hint"><em class="custom-block-title"> Hint</em>\n`
      } else {
        return `</div>\n`
      }
    }
  })
  .use(container, {
    name: 'important',
    openRender: (tokens, index, _options) => {
      const token = tokens[index]
      if (token.nesting === 1) {
        return `<div class="custom-block important"><em class="custom-block-title"> Important</em>\n`
      } else {
        return `</div>\n`
      }
    }
  })

function App () {
  const [toc, setToc] = useState([])
  const [currentMarkdown, setCurrentMarkdown] = useState('')
  const [currentHtml, setCurrentHtml] = useState('') // Store processed HTML
  const [currentPath, setCurrentPath] = useState('') // Relative path of the current .md file
  const [isLoadingContent, setIsLoadingContent] = useState(true) // For content area
  const [initialLoadError, setInitialLoadError] = useState(null) // For errors during GetBookData

  // --- Window Controls ---
  const handleMinimize = () => runtime.WindowMinimise()
  const handleClose = () => runtime.Quit()

  // Process markdown to HTML whenever markdown content changes
  useEffect(() => {
    if (!currentMarkdown) return

    try {
      // Use markdown-it to convert markdown to HTML
      const htmlContent = md.render(currentMarkdown)
      setCurrentHtml(htmlContent)
    } catch (error) {
      console.error('Error processing markdown:', error)
      setCurrentHtml(
        `<div class="error">Failed to process markdown: ${error.message}</div>`
      )
    }
  }, [currentMarkdown])

  // --- Book Loading Logic ---
  useEffect(() => {
    const fetchInitialBookData = async () => {
      setIsLoadingContent(true)
      setInitialLoadError(null)
      try {
        console.log('Fetching initial book data...')
        const bookData = await GetBookData()
        if (bookData.error) {
          console.error('Error from GetBookData:', bookData.error)
          setInitialLoadError(bookData.error)
          // Still set TOC if available, markdown might be an error message from Go
          setToc(bookData.toc || [])
          setCurrentMarkdown(
            bookData.initialMarkdown || `# Error\n\n${bookData.error}`
          )
          setCurrentPath(bookData.initialPath || '')
        } else {
          setToc(bookData.toc)
          setCurrentMarkdown(bookData.initialMarkdown)
          setCurrentPath(bookData.initialPath)
        }
      } catch (err) {
        console.error('Critical error fetching book data:', err)
        const errorMsg =
          err.message || 'Failed to load book structure from backend.'
        setInitialLoadError(errorMsg)
        setCurrentMarkdown(`# Critical Error\n\n${errorMsg}`)
      } finally {
        setIsLoadingContent(false)
      }
    }
    fetchInitialBookData()
  }, [])

  const [isTransitioning, setIsTransitioning] = useState(false)
  const loadChapter = useCallback(
    async relativePath => {
      if (!relativePath || !relativePath.toLowerCase().endsWith('.md')) {
        console.warn(
          'Attempted to load non-markdown file as chapter:',
          relativePath
        )
        return
      }
      if (relativePath === currentPath && currentMarkdown) {
        // Avoid reloading same content
        console.log('Chapter already loaded:', relativePath)
        return
      }
      setIsTransitioning(true) // Triggers FADEOUT via className
      setTimeout(async () => {
        // Wait for FADEOUT
        setIsLoadingContent(true)
        try {
          console.log(`Fetching markdown for: ${relativePath}`)
          const mdContent = await GetMarkdownContent(relativePath)
          setCurrentMarkdown(mdContent)
          setCurrentPath(relativePath)
          // Scroll content to top
          const contentArea = document.querySelector('.content-view-wrapper')
          if (contentArea) contentArea.scrollTop = 0
        } catch (err) {
          console.error(`Error fetching markdown for ${relativePath}:`, err)
          setCurrentMarkdown(
            `# Error loading content\n\nCould not load: \`${relativePath}\`\n\n${err.message}`
          )
          // Optionally set currentPath to an error state or keep previous
        } finally {
          setIsLoadingContent(false)
          // The useEffect for currentMarkdown will render.
          // Then we remove the transitioning state to allow fade-in.
          // This might need a slight delay or a ref to the content div
          // to ensure DOM is updated before changing opacity.
          setIsTransitioning(false) // Triggers FADEIN, or, resets to default
        }
      }, 300)
    },
    [currentPath, currentMarkdown]
  )

  // Handle link clicks within the processed HTML
  const handleLinkClick = useCallback(
    event => {
      // Only handle clicks on links
      if (event.target.tagName !== 'A') return
      const href = event.target.getAttribute('href')
      if (!href) return
      // Handle internal markdown links
      if (
        href.endsWith('.md') ||
        (!href.startsWith('http') &&
          !href.startsWith('#') &&
          !href.startsWith('/'))
      ) {
        event.preventDefault()
        let targetPath = href
        // Basic relative path resolution from current chapter's directory
        if (
          !href.startsWith('/') &&
          currentPath &&
          !href.toLowerCase().startsWith('http')
        ) {
          const currentDir = currentPath.substring(
            0,
            currentPath.lastIndexOf('/') + 1
          ) // includes trailing slash
          if (currentDir && !href.startsWith('../') && !href.startsWith('./')) {
            targetPath = `${currentDir}${href}`
          } else {
            // More complex relative path (e.g. ../file.md or ./file.md)
            const combinedPath = currentDir + href
            const parts = combinedPath.split('/')
            const newParts = []
            for (const part of parts) {
              if (part === '.' || part === '') continue
              if (part === '..') {
                if (newParts.length > 0) newParts.pop()
              } else newParts.push(part)
            }
            targetPath = newParts.join('/')
          }
        }
        console.log(
          `Internal link clicked: ${href}, resolved to: ${targetPath}`
        )
        loadChapter(targetPath)
      }
      // Handle external links
      else if (href.startsWith('http')) {
        event.preventDefault()
        BrowserOpenURL(href)
      }
      // Let browser handle anchor links within the page
    },
    [currentPath, loadChapter]
  )

  // Add event listener for link clicks
  useEffect(() => {
    const contentArea = document.querySelector('.content-view-wrapper')
    if (contentArea) {
      contentArea.addEventListener('click', handleLinkClick)
      return () => contentArea.removeEventListener('click', handleLinkClick)
    }
  }, [handleLinkClick])

  // Handle images in the HTML content
  const processImages = useCallback(
    htmlContent => {
      if (!htmlContent) return htmlContent
      // Create a temporary DOM element to parse and modify the HTML
      const tempDiv = document.createElement('div')
      tempDiv.innerHTML = htmlContent
      // Process all images
      const images = tempDiv.querySelectorAll('img')
      images.forEach(img => {
        let src = img.getAttribute('src')
        if (!src) return
        if (!src.startsWith('http') && !src.startsWith('/')) {
          // Relative image path
          let base = ''
          const lastSlash = currentPath.lastIndexOf('/')
          if (lastSlash !== -1) {
            base = currentPath.substring(0, lastSlash) // "folder"
          }
          let newSrc = base ? `${base}/${src}` : src
          const parts = newSrc.split('/')
          const resolved = []
          for (const part of parts) {
            if (part === '.' || part === '') continue
            if (part === '..') {
              if (resolved.length > 0) resolved.pop()
            } else {
              resolved.push(part)
            }
          }
          // All assets from book/src are served under /bookcontent/ by AssetServer
          src = `/frontend/dist/${resolved.join('/')}`
          img.setAttribute('src', src)
        } else if (src.startsWith('/')) {
          // Path is absolute from web root
          src = `/frontend/dist${src}`
          img.setAttribute('src', src)
        }
      })
      return tempDiv.innerHTML
    },
    [currentPath]
  )

  // --- CUSTOM: Process Markdown -> HTML -> Apply Customizations -> Render ---
  useEffect(() => {
    const contentEl = document.querySelector('.markdown-content')
    if (!contentEl) return
    if (!currentMarkdown) {
      contentEl.innerHTML = ''
      return
    }
    try {
      let htmlContent = md.render(currentMarkdown)
      htmlContent = processImages(htmlContent) // Process images first
      contentEl.innerHTML = htmlContent // Set HTML

      // MODIFIED: Call to add copy buttons AFTER HTML is set
      addCopyButtonsToCodeBlocks(contentEl)
    } catch (error) {
      console.error(
        'Error processing markdown or applying customisations:',
        error
      )
      contentEl.innerHTML = `<div class="error">Failed to render content: ${error.message}</div>`
    }
  }, [currentMarkdown, processImages]) // Rerun when markdown changes

  // --- Effect for Global Ripple Effect ---
  useEffect(() => {
    // Add the global click listener
    document.addEventListener('click', handleGlobalClickForRipple)
    // Cleanup function: Remove the global listener when App unmounts
    return () => {
      document.removeEventListener('click', handleGlobalClickForRipple)
    }
  }, []) // Empty dependency array: Runs once on mount, cleans up on unmount

  // --- Effect for setting up Copy Button Listeners ---
  // This effect now runs *after* the markdown content is rendered and buttons are added
  useEffect(() => {
    const contentEl = document.querySelector('.markdown-content')
    if (!contentEl || !currentMarkdown) return // Also check currentMarkdown to avoid running on empty content

    const addedListeners = setupCopyButtonListeners(contentEl)
    return () => {
      addedListeners.forEach(({ element, type, handler }) => {
        element.removeEventListener(type, handler)
      })
    }
    // DEPENDENCY: currentMarkdown changing means HTML changed, so re-run.
    // processImages is not directly used by setupCopyButtonListeners, but
    // currentMarkdown implies that both processImages and addCopyButtonsToCodeBlocks
    // have potentially run.
  }, [currentMarkdown])

  // Add bottom-left button to open content folder directly.
  // Replace this with the actual folder path you want to open
  const folderPath = 'C:\\Users\\drewg\\proj\\markdown\\LimpBook\\src'
  const handleOpenFolder = () => {
    OpenFolder(folderPath)
      .then(() => {
        console.log('Folder opened successfully')
      })
      .catch(err => {
        console.error('Error opening folder:', err)
      })
  }

  return (
    <div id='app-container'>
      <div className='title-bar' style={{ '--wails-draggable': 'drag' }}>
        <div className='title-bar-text'>   devodocs</div>
        <div className='window-controls'>
          <button
            onClick={handleMinimize}
            className='window-button minimize'
            aria-label='Minimize'
          >
            <Icon
              icon='solar:minimize-square-3-line-duotone'
              width='11'
              height='11'
              style={{ color: '#ffffff40' }}
            />
          </button>
          <button
            onClick={handleClose}
            className='window-button close'
            aria-label='Close'
          >
            <Icon
              icon='icon-park-twotone:close-one'
              width='11'
              height='11'
              style={{ color: '#ffffff40' }}
            />
          </button>
        </div>
      </div>

      <div className='main-layout hide-scrollbar scrollbar-none'>
        <TableOfContents
          tocItems={toc}
          onItemClick={loadChapter}
          currentPath={currentPath}
        />

        <div className='content-view-wrapper hide-scrollbar'>
          {' '}
          {/* Wrapper for scrolling */}
          {initialLoadError && (
            <div className='error-indicator global-error'>
              <h3>Failed to Load Book</h3>
              <pre>{initialLoadError}</pre>
            </div>
          )}
          {isLoadingContent && (
            <div className='loading-indicator content-loading'>
              {' '}
              Loading Content...
            </div>
          )}
          {!isLoadingContent && (
            // Add 'markdown-body' class if using github-markdown-css
            <div className='markdown-content hide-scrollbar'>
              {/* The HTML will be directly inserted into this div through useEffect */}
            </div>
          )}
        </div>
        {/* Footer with button in bottom left */}
        <div className='toc-footer'>
          <button onClick={handleOpenFolder} className='openFolderButton'>
            <svg
              xmlns='http://www.w3.org/2000/svg'
              className='h-5 w-5 mr-2'
              fill='none'
              viewBox='0 0 24 24'
              stroke='currentColor'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={1.5}
                d='M20.361 18.58c-.405.39-.943.641-1.536.684l-1.638.117a73 73 0 0 1-10.374 0l-1.514-.108a2.63 2.63 0 0 1-2.398-2.15a24.2 24.2 0 0 1-.222-7.244L2.95 7.61a2.68 2.68 0 0 1 2.66-2.36h2.292c1.118 0 2.05.798 2.255 1.856h8.314c1.307 0 2.42.95 2.625 2.24l.064.4l.04.254h.335a2.093 2.093 0 0 1 1.951 2.852l-1.25 3.213a5.9 5.9 0 0 1-1.876 2.514m-.745-8.998l.064.401q0 .008.003.017H10.37a2.75 2.75 0 0 0-2.565 1.757L5.473 17.78l-.068-.005a1.13 1.13 0 0 1-1.03-.922a22.7 22.7 0 0 1-.208-6.796l.273-2.27A1.18 1.18 0 0 1 5.61 6.75h2.292c.44 0 .797.357.797.797c0 .585.474 1.06 1.06 1.06h8.712c.57 0 1.054.413 1.144.975M7.039 17.893a71 71 0 0 0 10.041-.008l1.638-.118l.195-.018l-.002-.002a4.38 4.38 0 0 0 1.929-2.226l1.25-3.213a.593.593 0 0 0-.554-.808H10.37c-.516 0-.979.317-1.165.799z'
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

export default App
```

## `frontend\src\components\TableOfContents.jsx`

```js
import React from "react";
import "./TableOfContents.css";
// Import the new Go function that will be bound by Wails
import { ShowTOCContextMenu } from "../../wailsjs/go/main/App";

const TOCItemLink = ({ item, onItemClick, currentPath, level }) => {
	const isCurrent = item.path && item.path === currentPath;
	const effectiveLevel = typeof level === "number" ? level : item.level || 0;

	// Only make items with .md paths clickable for content loading AND context menu.
	const isClickable = item.path && item.path.toLowerCase().endsWith(".md");

	const handleContextMenu = (event) => {
		// Ensure this is a clickable item with a valid path before showing context menu
		if (isClickable && item.path) {
			event.preventDefault(); // Prevent default browser context menu
			ShowTOCContextMenu(item.path); // Call the Go function
		}
		// If not clickable, or no path, the default browser context menu might appear or nothing.
		// We could explicitly allow default for non-clickable if needed:
		// else { event.stopPropagation(); /* or do nothing to allow default */ }
	};

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
					onContextMenu={handleContextMenu} // Attach the context menu handler here
					style={{ paddingLeft: `${effectiveLevel * 15 + 10}px` }} // Indentation
					title={item.path}
				>
					{item.title}
				</a>
			) : (
				<span
					className="toc-item-header"
					style={{ paddingLeft: `${effectiveLevel * 15 + 10}px`, fontWeight: item.level === 0 ? "bold" : "normal" }}
					// No onContextMenu for non-clickable headers by default
				>
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

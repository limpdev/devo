## `app.go`

```go
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
	Title     string    `json:"title"`
	Path      string    `json:"path,omitempty"` // Relative path to the .md file from ./book/src/
	Level     int       `json:"level"`          // Indentation level
	Children  []TOCItem `json:"children,omitempty"`
	IsDivider bool      `json:"isDivider,omitempty"` // Flag for section headings/dividers
}

// BookData holds the TOC and the content of the initially loaded chapter
type BookData struct {
	TOC             []TOCItem `json:"toc"`
	InitialMarkdown string    `json:"initialMarkdown"`
	InitialPath     string    `json:"initialPath"`     // Path of the initially loaded markdown
	Error           string    `json:"error,omitempty"` // In case of loading errors
}

// ... (App struct, NewApp, startup, shutdown, Greet, GetMarkdownContent from previous steps)

const bookSrcPath = "book/LimpBook" // Define base path for book source
// var summaryFilePath = path.Join(bookSrcPath, "SUMMARY.md")

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

	// Regex to capture section headings like "# Section Title"
	reHeading := regexp.MustCompile(`^#+\s+(.+)$`)

	scanner := bufio.NewScanner(file)
	var parentStack []*[]TOCItem            // Stack to manage current parent for nesting
	parentStack = append(parentStack, &toc) // Root level
	lastLevel := -1

	for scanner.Scan() {
		line := scanner.Text()
		trimmedLine := strings.TrimSpace(line)

		// Skip empty lines & section dividers
		if trimmedLine == "" || trimmedLine == "---" {
			continue
		}

		// Check if this is a heading/section title
		headingMatches := reHeading.FindStringSubmatch(trimmedLine)
		if len(headingMatches) > 1 {
			headingTitle := strings.TrimSpace(headingMatches[1])
			sectionItem := TOCItem{
				Title:     headingTitle,
				Level:     0, // Section headers are at root level
				IsDivider: true,
			}

			// Always add section headers to the root level
			toc = append(toc, sectionItem)

			// Reset parent stack to root after a section header
			parentStack = parentStack[:1] // Keep only the root level
			lastLevel = -1                // Reset level tracking
			continue
		}

		// Process regular TOC items
		matches := re.FindStringSubmatch(line)
		if len(matches) == 0 {
			// Not a regular TOC item format we recognize
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
		// Skip dividers when looking for markdown files
		if item.IsDivider {
			continue
		}

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

## `frontend\dist\index.css`

```css
:root{--crosshair: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAcCAYAAAByDd+UAAABdWlDQ1BrQ0dDb2xvclNwYWNlRGlzcGxheVAzAAAokXWQvUvDUBTFT6tS0DqIDh0cMolD1NIKdnFoKxRFMFQFq1OafgltfCQpUnETVyn4H1jBWXCwiFRwcXAQRAcR3Zw6KbhoeN6XVNoi3sfl/Ticc7lcwBtQGSv2AijplpFMxKS11Lrke4OHnlOqZrKooiwK/v276/PR9d5PiFlNu3YQ2U9cl84ul3aeAlN//V3Vn8maGv3f1EGNGRbgkYmVbYsJ3iUeMWgp4qrgvMvHgtMunzuelWSc+JZY0gpqhrhJLKc79HwHl4plrbWD2N6f1VeXxRzqUcxhEyYYilBRgQQF4X/8044/ji1yV2BQLo8CLMpESRETssTz0KFhEjJxCEHqkLhz634PrfvJbW3vFZhtcM4v2tpCAzidoZPV29p4BBgaAG7qTDVUR+qh9uZywPsJMJgChu8os2HmwiF3e38M6Hvh/GMM8B0CdpXzryPO7RqFn4Er/QcXKWq8UwZBywAAAARjSUNQDA0AAW4D4+8AAAA4ZVhJZk1NACoAAAAIAAGHaQAEAAAAAQAAABoAAAAAAAKgAgAEAAAAAQAAABygAwAEAAAAAQAAABwAAAAAR3XWmAAAA+5JREFUSA29lV1IU2EYx882nfNjm9P5sa2JH2FqKdIqMuwmCipoBmEQiGAU0k3deGt5FVEZ3YgjuioIlGgg1IWUlQPLfTSX0xK3uSl+z6/pdN/r/4qDcu60rdmBwznnPe/7/J7/8z7P81Lj4+O8xcVFMfWfLubg4CBls9nuA9oeDAaT95vLIICOjg5pWVlZo1QqdQiFwhcCgcDHYDCc+wHfBoYMd3d3VwIqT01NramoqLBA8bOUlBRj6H8inn8AicGhoaEHgUBA6vf7j5WWlgZ5PN5tqO1NBIzYYO42tLm5mVNQUHAa0A/Dw8MbuJ5A6eXd8+L9DgO63e6FlZUVj1gsPpeenq5DUnnm5+eVDofjLcBH4wWF1oUBodC6sLDwzePxHMR+XkBINXq9Xre2tnYR4I9w6EpocTzPMKDX61XZ7fZRl8sVxA2m9CyXy9UaDIah1dVVHqAvofRMPDCyJgxYV1c3try8/AlKnQijZ319vRjQWmSr2mQy/VhaWgoC/gjgvHigYUBkpL+pqakfaowAWra2tigoPVxYWFgJgAoNwszhcLg+n68RSmNuFGHAHa8D2MfnUDOZlJREOZ1OCoDjEonkAPbyq8ViyUMUHqJD9QAqjUVpJCCFcngNhTaUB0VuhNazs6eZgCmnp6d9cOo8evErQLnRQiMCm5ub1wDVI4koJpNJHBhFmIUolSP5+fne2dnZfoxRSLBaKL33z0BiAEZHoYxC13HivRfhzYXKQ8haEW4T9nMFUaCmpqbuIMlORQONqJAs7urq+mI2mz8DaIJhOzKVhSeTxWJV8/l8olpP5iGxVtVq9U2EltYemUs7YWRkxKPRaK6jHBTYR3JRJMRQLQFQxGazLVC5gczmp6WlVcCBbGKU7qIFkoWdnZ2WhoYGBYw5CIxASdaiE8mysrIcGP+JzE2amZk5MTk5eYMORv79FRgygD0khrc/USIknOLMzEwBHBiDI16EU63T6Uq0Wi1tbUYNVKlUhrm5OQNAQaISSUJqszojI2MKmWpHM6jCcbYhk8nCjryQ0+TJ+v2D7h0KveXl5TokUCmUFe6ENzc7O1uPcHIwXgIHTiLUZoVCYYhkK2qFxEB7e7sGxjthlEII/XDCgYSpQblYUS5BUiKoyUuRYGQ8JiBZoFQqe5C176HGjfBa0P5kaO6bpGwAp3B8SenKI2ag1Wp19fX1XZuYmHiKsNpxarjQfarx/g5QN2qSRyeEdoOJIrqrpaXlKurxFpp6pUgkemw0GjMAZLS2tt4lp85ea6NOmr0WDwwMjBQXF39HwtiTk5OrioqKOtBx3sjlct9e8xM6Vl9fn9PW1sZOqNFEGPsFi9JpLBWNZgMAAAAASUVORK5CYII=), auto}.markdown-content{max-width:1050px;justify-self:anchor-center;font-family:SF Pro Text,Symbols Nerd Font,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;scroll-behavior:smooth;text-rendering:optimizeLegibility}.react-ui{width:100%!important;padding:0;margin:0;background-color:#0000;overflow:hidden;scroll-behavior:smooth!important;border-radius:7px}html{text-rendering:optimizeLegibility!important;width:100%;background-color:#0000;color:#c1c1c1}@font-face{font-family:Symbols Nerd Font;font-style:normal;font-weight:400;src:local(""),url(/SymbolsNerdFont-Regular.ttf) format("ttf")}body{margin:0;color:#ccc;font-family:SF Pro Text,Symbols Nerd Font,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Oxygen,Ubuntu,Fira Sans,Droid Sans,Helvetica Neue,sans-serif}#app{width:auto;height:100vh;text-align:center}html,body,#root{width:100%;height:100vh;margin:0;padding:0;overflow:hidden;font-family:SF Pro Rounded,Symbols Nerd Font,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Oxygen,Ubuntu,Fira Sans,Droid Sans,Helvetica Neue,sans-serif;background-color:transparent}#app-container{display:flex;flex-direction:column;height:100%;width:100%;overflow:hidden;box-sizing:border-box;cursor:var(--crosshair),auto}.title-bar{background:#16161680;display:flex;justify-content:space-between;align-items:center;height:24px;cursor:grab,auto;color:#faa55050;padding:1px 8px;flex-shrink:0;-webkit-user-select:none;user-select:none;cursor:var(--crosshair)}.window-controls{display:flex}.window-button{background:none;border:none;border-radius:5px;margin-right:1.5px;height:14px;line-height:1.1em;font-size:11px;cursor:var(--crosshair);font-family:Segoe MDL2 Assets,Symbols Nerd Font,Apple Symbols,"system-ui";-webkit-app-region:no-drag;transition:all .3s ease-in}.window-button.close:hover{background:#cf5e5970}.window-button.minimize:hover{background:#80808040}.title-bar-text{font-family:Jost,Symbols Nerd Font,sans-serif;font-size:larger}.content-area{flex-grow:1;position:relative;cursor:var(--crosshair),auto}.loading-indicator{position:absolute;top:0;left:0;width:100%;height:100vh;display:flex;justify-content:center;align-items:center;background-color:#10101000;z-index:10}article{display:flow;max-width:1100px;min-width:650px;justify-content:center;text-rendering:optimizeLegibility!important}.main-layout{--base-size-4: .25rem;--base-size-8: .5rem;--base-size-16: 1rem;--base-size-24: 1.5rem;--base-size-40: 2.5rem;--base-text-weight-normal: 400;--base-text-weight-medium: 500;--base-text-weight-semibold: 600;--fontStack-monospace: "SFMono Nerd Font", "SF Mono", "RedditMono Nerd Font", "Symbols Nerd Font", Menlo, monospace;--fgColor-accent: Highlight}i[class^=devicon-]{font-size:2rem}@media (prefers-color-scheme: dark){html,[data-theme=dark]{color-scheme:dark;--focus-outlineColor: #1f6feb;--fgColor-default: #f0f6fc;--fgColor-muted: #9198a1;--fgColor-accent: #4493f850;--fgColor-success: #3fb950;--fgColor-attention: #d29922;--fgColor-danger: #f85149;--fgColor-done: #ab7df8;--bgColor-default: #161616;--bgColor-muted: #09090a;--bgColor-neutral-muted: #656c7633;--bgColor-attention-muted: #ffee0033;--borderColor-default: #3d444d;--borderColor-muted: #3d444db3;--borderColor-neutral-muted: #3d444db3;--borderColor-accent-emphasis: #1f6feb;--borderColor-success-emphasis: #238636;--borderColor-attention-emphasis: #9e6a03;--borderColor-danger-emphasis: #da3633;--borderColor-done-emphasis: #8957e5;--color-prettylights-syntax-comment: #9198a1;--color-prettylights-syntax-constant: #79c0ff;--color-prettylights-syntax-constant-other-reference-link: #a5d6ff;--color-prettylights-syntax-entity: #d2a8ff;--color-prettylights-syntax-storage-modifier-import: #f0f6fc;--color-prettylights-syntax-entity-tag: #7ee787;--color-prettylights-syntax-keyword: #ff7b72;--color-prettylights-syntax-string: #a5d6ff;--color-prettylights-syntax-variable: #ffa657;--color-prettylights-syntax-brackethighlighter-unmatched: #f85149;--color-prettylights-syntax-brackethighlighter-angle: #9198a1;--color-prettylights-syntax-invalid-illegal-text: #f0f6fc;--color-prettylights-syntax-invalid-illegal-bg: #8e1519;--color-prettylights-syntax-carriage-return-text: #f0f6fc;--color-prettylights-syntax-carriage-return-bg: #b62324;--color-prettylights-syntax-string-regexp: #7ee787;--color-prettylights-syntax-markup-list: #f2cc60;--color-prettylights-syntax-markup-heading: #1f6feb;--color-prettylights-syntax-markup-italic: #f0f6fc;--color-prettylights-syntax-markup-bold: #f0f6fc;--color-prettylights-syntax-markup-deleted-text: #ffdcd7;--color-prettylights-syntax-markup-deleted-bg: #67060c;--color-prettylights-syntax-markup-inserted-text: #aff5b4;--color-prettylights-syntax-markup-inserted-bg: #033a16;--color-prettylights-syntax-markup-changed-text: #ffdfb6;--color-prettylights-syntax-markup-changed-bg: #5a1e02;--color-prettylights-syntax-markup-ignored-text: #f0f6fc;--color-prettylights-syntax-markup-ignored-bg: #1158c7;--color-prettylights-syntax-meta-diff-range: #d2a8ff;--color-prettylights-syntax-sublimelinter-gutter-mark: #3d444d}}.main-layout{padding:0;-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;margin:0;color:var(--fgColor-default);background-color:#16161680;font-family:SF Pro Text,Satoshi Nerd Font,Symbols Nerd Font,BlinkMacSystemFont,Segoe UI,Arial,sans-serif,"Apple Color Emoji","Segoe UI Emoji";font-size:16.5px;line-height:1.3;word-wrap:break-word;overflow-y:scroll}.main-layout .octicon{display:inline-block;fill:currentColor;vertical-align:text-bottom}.main-layout h1:hover .anchor .octicon-link:before,.main-layout h2:hover .anchor .octicon-link:before,.main-layout h3:hover .anchor .octicon-link:before,.main-layout h4:hover .anchor .octicon-link:before,.main-layout h5:hover .anchor .octicon-link:before,.main-layout h6:hover .anchor .octicon-link:before{width:16px;height:16px;content:" ";display:inline-block;background-color:currentColor;-webkit-mask-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' version='1.1' aria-hidden='true'><path fill-rule='evenodd' d='M7.775 3.275a.75.75 0 001.06 1.06l1.25-1.25a2 2 0 112.83 2.83l-2.5 2.5a2 2 0 01-2.83 0 .75.75 0 00-1.06 1.06 3.5 3.5 0 004.95 0l2.5-2.5a3.5 3.5 0 00-4.95-4.95l-1.25 1.25zm-4.69 9.64a2 2 0 010-2.83l2.5-2.5a2 2 0 012.83 0 .75.75 0 001.06-1.06 3.5 3.5 0 00-4.95 0l-2.5 2.5a3.5 3.5 0 004.95 4.95l1.25-1.25a.75.75 0 00-1.06-1.06l-1.25 1.25a2 2 0 01-2.83 0z'></path></svg>");mask-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' version='1.1' aria-hidden='true'><path fill-rule='evenodd' d='M7.775 3.275a.75.75 0 001.06 1.06l1.25-1.25a2 2 0 112.83 2.83l-2.5 2.5a2 2 0 01-2.83 0 .75.75 0 00-1.06 1.06 3.5 3.5 0 004.95 0l2.5-2.5a3.5 3.5 0 00-4.95-4.95l-1.25 1.25zm-4.69 9.64a2 2 0 010-2.83l2.5-2.5a2 2 0 012.83 0 .75.75 0 001.06-1.06 3.5 3.5 0 00-4.95 0l-2.5 2.5a3.5 3.5 0 004.95 4.95l1.25-1.25a.75.75 0 00-1.06-1.06l-1.25 1.25a2 2 0 01-2.83 0z'></path></svg>")}.main-layout details,.main-layout figcaption,.main-layout figure{display:block}.main-layout summary{display:list-item}.main-layout [hidden]{display:none!important}.main-layout a{background-color:transparent;text-decoration:none;color:#7cc0ede0}a.toc-item-link{color:#cecece;font-family:Jost,Symbols Nerd Font,sans-serif;font-weight:500}.main-layout abbr[title]{border-bottom:none;-webkit-text-decoration:underline dotted;text-decoration:underline dotted}.main-layout b,.main-layout strong{font-weight:var(--base-text-weight-semibold, 600)}.main-layout dfn{font-style:italic}.main-layout h1{margin:.67em 0;font-weight:var(--base-text-weight-semibold, 600);padding-bottom:.3em;font-size:2em;border-bottom:1px solid var(--borderColor-muted)}.main-layout mark{background-color:#fe03;color:var(--fgColor-default);padding:3px;border-radius:4px}.main-layout small{font-size:90%}.main-layout sub,.main-layout sup{font-size:75%;line-height:0;position:relative;vertical-align:baseline}.main-layout sub{bottom:-.25em}.main-layout sup{top:-.5em}.main-layout img{border-style:none;max-width:100%;box-sizing:content-box}.main-layout code,.main-layout kbd,.main-layout pre,.main-layout samp{font-family:var(--font-family-monospace);font-size:1em}.main-layout figure{margin:1em var(--base-size-40)}.main-layout hr{box-sizing:content-box;overflow:hidden;background:transparent;border-bottom:1px solid var(--borderColor-muted);height:.25em;padding:0;margin:var(--base-size-24) 0;background-color:var(--borderColor-default);border:0}.main-layout input{font:inherit;margin:0;overflow:visible;font-family:inherit;font-size:inherit;line-height:inherit}.main-layout [type=button],.main-layout [type=reset],.main-layout [type=submit]{-webkit-appearance:button;-moz-appearance:button;appearance:button}.main-layout [type=checkbox],.main-layout [type=radio]{box-sizing:border-box;padding:0}.main-layout [type=number]::-webkit-inner-spin-button,.main-layout [type=number]::-webkit-outer-spin-button{height:auto}.main-layout [type=search]::-webkit-search-cancel-button,.main-layout [type=search]::-webkit-search-decoration{-webkit-appearance:none;-moz-appearance:none;appearance:none}.main-layout ::-webkit-input-placeholder{color:inherit;opacity:.54}.main-layout ::-webkit-file-upload-button{-webkit-appearance:button;-moz-appearance:button;appearance:button;font:inherit}.main-layout a:hover{text-decoration:underline}.main-layout ::placeholder{color:var(--fgColor-muted);opacity:1}table{padding:0;border-collapse:collapse;margin-left:auto;margin-right:auto;text-align:center}table tr{background-color:#0b182a;margin:0;padding:0}table tr:nth-child(2n){background-color:#f8f8f8}table tr th{font-family:Roboto Slab,sans-serif;font-weight:700;background-color:#0b182a;font-size:15px;margin:0;padding:.4em .35em}table tr td{margin:0;font-size:14px;padding:5px}table tr th :first-child,table tr td :first-child{margin-top:0}table tr th :last-child,table tr td :last-child{margin-bottom:0}.main-layout table tr:nth-child(2n),.main-layout table tr{transition:all .3s ease-in-out}.main-layout table tr:hover{background-color:#f8f8f81b}.main-layout table tr:nth-child(2n):hover{background-color:#f8f8f81b}.main-layout details summary{cursor:pointer}.main-layout a:focus,.main-layout [role=button]:focus,.main-layout input[type=radio]:focus,.main-layout input[type=checkbox]:focus{outline:2px solid var(--focus-outlineColor);outline-offset:-2px;box-shadow:none}.main-layout a:focus:not(:focus-visible),.main-layout [role=button]:focus:not(:focus-visible),.main-layout input[type=radio]:focus:not(:focus-visible),.main-layout input[type=checkbox]:focus:not(:focus-visible){outline:solid 1px transparent}.main-layout a:focus-visible,.main-layout [role=button]:focus-visible,.main-layout input[type=radio]:focus-visible,.main-layout input[type=checkbox]:focus-visible{outline:2px solid var(--focus-outlineColor);outline-offset:-2px;box-shadow:none}.main-layout a:not([class]):focus,.main-layout a:not([class]):focus-visible,.main-layout input[type=radio]:focus,.main-layout input[type=radio]:focus-visible,.main-layout input[type=checkbox]:focus,.main-layout input[type=checkbox]:focus-visible{outline-offset:0}.main-layout kbd{display:inline-block;padding:var(--base-size-4);font:11px var(--fontStack-monospace, ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace);line-height:10px;color:var(--fgColor-default);vertical-align:middle;background-color:var(--bgColor-muted);border:solid 1px var(--borderColor-neutral-muted);border-bottom-color:var(--borderColor-neutral-muted);border-radius:10px;box-shadow:inset 0 -1px 0 var(--borderColor-neutral-muted)}.main-layout h1,.main-layout h2,.main-layout h3,.main-layout h4,.main-layout h5,.main-layout h6{margin-top:var(--base-size-24);margin-bottom:var(--base-size-16);font-weight:var(--base-text-weight-semibold, 600);line-height:1.25}.main-layout h2{font-weight:var(--base-text-weight-semibold, 600);padding-bottom:.3em;font-size:1.5em;border-bottom:1px solid var(--borderColor-muted)}.main-layout h3{font-weight:var(--base-text-weight-semibold, 600);font-size:1.25em}.main-layout h4{font-weight:var(--base-text-weight-semibold, 600);font-size:1em}.main-layout h5{font-weight:var(--base-text-weight-semibold, 600);font-size:.875em}.main-layout h6{font-weight:var(--base-text-weight-semibold, 600);font-size:.85em;color:var(--fgColor-muted)}.main-layout p{margin-top:0;margin-bottom:10px}.main-layout blockquote{margin:0;padding:0 1em;color:var(--fgColor-muted);border-left:.25em solid var(--borderColor-default)}.main-layout ul,.main-layout ol{margin-top:0;margin-bottom:0;padding-left:2em}.main-layout ol ol,.main-layout ul ol{list-style-type:lower-roman}.main-layout ul ul ol,.main-layout ul ol ol,.main-layout ol ul ol,.main-layout ol ol ol{list-style-type:lower-alpha}.main-layout dd{margin-left:0}.main-layout tt,.main-layout code,.main-layout samp{font-family:SFMono Nerd Font,SF Mono,Menlo,monospace;font-size:12px}.main-layout pre{margin:1.5em;font-family:SFMono Nerd Font,SF Mono,RedditMono Nerd Font,Menlo,monospace;font-size:11.5px}.main-layout .octicon{display:inline-block;overflow:visible!important;vertical-align:text-bottom;fill:currentColor}.main-layout input::-webkit-outer-spin-button,.main-layout input::-webkit-inner-spin-button{margin:0;-webkit-appearance:none;-moz-appearance:none;appearance:none}.main-layout .mr-2{margin-right:var(--base-size-8, 8px)!important}.main-layout:before{display:table;content:""}.main-layout:after{display:table;clear:both;content:""}.main-layout>*:first-child{margin-top:0!important}.main-layout>*:last-child{margin-bottom:0!important}.main-layout a:not([href]){color:inherit;text-decoration:none}.main-layout .absent{color:var(--fgColor-danger)}.main-layout .anchor{float:left;padding-right:var(--base-size-4);margin-left:-20px;line-height:1}.main-layout .anchor:focus{outline:none}.main-layout p,.main-layout blockquote,.main-layout ul,.main-layout ol,.main-layout dl,.main-layout table,.main-layout pre,.main-layout details{margin-top:0;margin-bottom:var(--base-size-16)}.main-layout blockquote>:first-child{margin-top:0}.main-layout blockquote>:last-child{margin-bottom:0}.main-layout h1 .octicon-link,.main-layout h2 .octicon-link,.main-layout h3 .octicon-link,.main-layout h4 .octicon-link,.main-layout h5 .octicon-link,.main-layout h6 .octicon-link{color:var(--fgColor-default);vertical-align:middle;visibility:hidden}.main-layout h1:hover .anchor,.main-layout h2:hover .anchor,.main-layout h3:hover .anchor,.main-layout h4:hover .anchor,.main-layout h5:hover .anchor,.main-layout h6:hover .anchor{text-decoration:none}.main-layout h1:hover .anchor .octicon-link,.main-layout h2:hover .anchor .octicon-link,.main-layout h3:hover .anchor .octicon-link,.main-layout h4:hover .anchor .octicon-link,.main-layout h5:hover .anchor .octicon-link,.main-layout h6:hover .anchor .octicon-link{visibility:visible}.main-layout h1 tt,.main-layout h1 code,.main-layout h2 tt,.main-layout h2 code,.main-layout h3 tt,.main-layout h3 code,.main-layout h4 tt,.main-layout h4 code,.main-layout h5 tt,.main-layout h5 code,.main-layout h6 tt,.main-layout h6 code{padding:0 .2em;font-size:inherit}.main-layout summary h1,.main-layout summary h2,.main-layout summary h3,.main-layout summary h4,.main-layout summary h5,.main-layout summary h6{display:inline-block}.main-layout summary h1 .anchor,.main-layout summary h2 .anchor,.main-layout summary h3 .anchor,.main-layout summary h4 .anchor,.main-layout summary h5 .anchor,.main-layout summary h6 .anchor{margin-left:-40px}.main-layout summary h1,.main-layout summary h2{padding-bottom:0;border-bottom:0}.main-layout ul.no-list,.main-layout ol.no-list{padding:0;list-style-type:none}.main-layout ol[type="a s"]{list-style-type:lower-alpha}.main-layout ol[type="A s"]{list-style-type:upper-alpha}.main-layout ol[type="i s"]{list-style-type:lower-roman}.main-layout ol[type="I s"]{list-style-type:upper-roman}.main-layout ol[type="1"]{list-style-type:decimal}.main-layout div>ol:not([type]){list-style-type:decimal}.main-layout ul ul,.main-layout ul ol,.main-layout ol ol,.main-layout ol ul{margin-top:0;margin-bottom:0}.main-layout li>p{margin-top:var(--base-size-16)}.main-layout li+li{margin-top:.25em}.main-layout dl{padding:0}.main-layout dl dt{padding:0;margin-top:var(--base-size-16);font-size:1em;font-style:italic;font-weight:var(--base-text-weight-semibold, 600)}.main-layout dl dd{padding:0 var(--base-size-16);margin-bottom:var(--base-size-16)}.main-layout table th{font-weight:var(--base-text-weight-semibold, 600)}.main-layout table th,.main-layout table td{padding:6px 13px;border:0px solid var(--borderColor-default)}.main-layout table td>:last-child{margin-bottom:0}.main-layout table tr{font-family:Satoshi Nerd Font,sans-serif;background-color:var(--bgColor-default);border-top:1px solid var(--borderColor-muted)}.main-layout table tr:nth-child(2n){background-color:var(--bgColor-muted)}.main-layout table img{background-color:transparent}.main-layout img[align=right]{padding-left:20px}.main-layout img[align=left]{padding-right:20px}.main-layout .emoji{max-width:none;vertical-align:text-top;background-color:transparent}.main-layout span.frame{display:block;overflow:hidden}.main-layout span.frame>span{display:block;float:left;width:auto;padding:7px;margin:13px 0 0;overflow:hidden;border:1px solid var(--borderColor-default)}.main-layout span.frame span img{display:block;float:left}.main-layout span.frame span span{display:block;padding:5px 0 0;clear:both;color:var(--fgColor-default)}.main-layout span.align-center{display:block;overflow:hidden;clear:both}.main-layout span.align-center>span{display:block;margin:13px auto 0;overflow:hidden;text-align:center}.main-layout span.align-center span img{margin:0 auto;text-align:center}.main-layout span.align-right{display:block;overflow:hidden;clear:both}.main-layout span.align-right>span{display:block;margin:13px 0 0;overflow:hidden;text-align:right}.main-layout span.align-right span img{margin:0;text-align:right}.main-layout span.float-left{display:block;float:left;margin-right:13px;overflow:hidden}.main-layout span.float-left span{margin:13px 0 0}.main-layout span.float-right{display:block;float:right;margin-left:13px;overflow:hidden}.main-layout span.float-right>span{display:block;margin:13px auto 0;overflow:hidden;text-align:right}.main-layout code,.main-layout tt{padding:.2em .4em;margin:0;font-size:85%;white-space:break-spaces;background-color:var(--bgColor-neutral-muted);border-radius:7px}.main-layout code br,.main-layout tt br{display:none}.main-layout del code{text-decoration:inherit}.main-layout samp{font-size:85%}pre{cursor:var(--crosshair);margin-left:1.5em;margin-right:1.5em}.main-layout pre code{font-size:95%;overflow-wrap:anywhere}.main-layout pre>code{padding:0;margin:0;word-break:normal;white-space:break-spaces;background:transparent;border:0}.main-layout .highlight{margin-bottom:var(--base-size-16)}.main-layout .highlight pre{margin-bottom:0;word-break:normal}.main-layout .highlight pre,.main-layout pre{padding:var(--base-size-16);overflow:inherit;font-size:85%;line-height:1.4;color:var(--fgColor-default);background-color:#09090a;border-radius:10px;box-shadow:0 10px 16px #0003,0 6px 20px #00000030!important}.main-layout pre code,.main-layout pre tt{display:inline;max-width:auto;padding:0;margin:0;overflow:visible;line-height:inherit;background-color:transparent;border:0}.main-layout .csv-data td,.main-layout .csv-data th{padding:5px;overflow:hidden;font-size:12px;line-height:1;text-align:left;white-space:nowrap}.main-layout .csv-data .blob-num{padding:10px var(--base-size-8) 9px;text-align:right;background:var(--bgColor-default);border:0}.main-layout .csv-data tr{border-top:0}.main-layout .csv-data th{font-weight:var(--base-text-weight-semibold, 600);background:var(--bgColor-muted);border-top:0}.main-layout [data-footnote-ref]:before{content:"["}.main-layout [data-footnote-ref]:after{content:"]"}.main-layout .footnotes{font-size:12px;color:var(--fgColor-muted);border-top:1px solid var(--borderColor-default)}.main-layout .footnotes ol{padding-left:var(--base-size-16)}.main-layout .footnotes ol ul{display:inline-block;padding-left:var(--base-size-16);margin-top:var(--base-size-16)}.main-layout .footnotes li{position:relative}.main-layout .footnotes li:target:before{position:absolute;top:calc(var(--base-size-8) * -1);right:calc(var(--base-size-8) * -1);bottom:calc(var(--base-size-8) * -1);left:calc(var(--base-size-24) * -1);pointer-events:none;content:"";border:2px solid var(--borderColor-accent-emphasis);border-radius:6px}.main-layout .footnotes li:target{color:var(--fgColor-default)}.main-layout .footnotes .data-footnote-backref g-emoji{font-family:monospace}.main-layout body:has(:modal){padding-right:var(--dialog-scrollgutter)!important}.main-layout .pl-c{color:var(--color-prettylights-syntax-comment)}.main-layout .pl-c1,.main-layout .pl-s .pl-v{color:var(--color-prettylights-syntax-constant)}.main-layout .pl-e,.main-layout .pl-en{color:var(--color-prettylights-syntax-entity)}.main-layout .pl-smi,.main-layout .pl-s .pl-s1{color:var(--color-prettylights-syntax-storage-modifier-import)}.main-layout .pl-ent{color:var(--color-prettylights-syntax-entity-tag)}.main-layout .pl-k{color:var(--color-prettylights-syntax-keyword)}.main-layout .pl-s,.main-layout .pl-pds,.main-layout .pl-s .pl-pse .pl-s1,.main-layout .pl-sr,.main-layout .pl-sr .pl-cce,.main-layout .pl-sr .pl-sre,.main-layout .pl-sr .pl-sra{color:var(--color-prettylights-syntax-string)}.main-layout .pl-v,.main-layout .pl-smw{color:var(--color-prettylights-syntax-variable)}.main-layout .pl-bu{color:var(--color-prettylights-syntax-brackethighlighter-unmatched)}.main-layout .pl-ii{color:var(--color-prettylights-syntax-invalid-illegal-text);background-color:var(--color-prettylights-syntax-invalid-illegal-bg)}.main-layout .pl-c2{color:var(--color-prettylights-syntax-carriage-return-text);background-color:var(--color-prettylights-syntax-carriage-return-bg)}.main-layout .pl-sr .pl-cce{font-weight:700;color:var(--color-prettylights-syntax-string-regexp)}.main-layout .pl-ml{color:var(--color-prettylights-syntax-markup-list)}.main-layout .pl-mh,.main-layout .pl-mh .pl-en,.main-layout .pl-ms{font-weight:700;color:var(--color-prettylights-syntax-markup-heading)}.main-layout .pl-mi{font-style:italic;color:var(--color-prettylights-syntax-markup-italic)}.main-layout .pl-mb{font-weight:700;color:var(--color-prettylights-syntax-markup-bold)}.main-layout .pl-md{color:var(--color-prettylights-syntax-markup-deleted-text);background-color:var(--color-prettylights-syntax-markup-deleted-bg)}.main-layout .pl-mi1{color:var(--color-prettylights-syntax-markup-inserted-text);background-color:var(--color-prettylights-syntax-markup-inserted-bg)}.main-layout .pl-mc{color:var(--color-prettylights-syntax-markup-changed-text);background-color:var(--color-prettylights-syntax-markup-changed-bg)}.main-layout .pl-mi2{color:var(--color-prettylights-syntax-markup-ignored-text);background-color:var(--color-prettylights-syntax-markup-ignored-bg)}.main-layout .pl-mdr{font-weight:700;color:var(--color-prettylights-syntax-meta-diff-range)}.main-layout .pl-by{color:var(--color-prettylights-syntax-brackethighlighter-angle)}.main-layout .pl-sg{color:var(--color-prettylights-syntax-sublimelinter-gutter-mark)}.main-layout .pl-corl{text-decoration:underline;color:var(--color-prettylights-syntax-constant-other-reference-link)}.main-layout [role=button]:focus:not(:focus-visible),.main-layout [role=tabpanel][tabindex="0"]:focus:not(:focus-visible),.main-layout button:focus:not(:focus-visible),.main-layout summary:focus:not(:focus-visible),.main-layout a:focus:not(:focus-visible){outline:none;box-shadow:none}.main-layout [tabindex="0"]:focus:not(:focus-visible),.main-layout details-dialog:focus:not(:focus-visible){outline:none}.main-layout g-emoji{display:inline-block;min-width:1ch;font-family:"Apple Color Emoji",Symbols Nerd Font,Segoe UI Symbol;font-size:1em;font-style:normal!important;font-weight:var(--base-text-weight-normal, 400);line-height:1;vertical-align:-.075em}.main-layout g-emoji img{width:1em;height:1em}.main-layout .task-list-item{list-style-type:none}.main-layout .task-list-item label{font-weight:var(--base-text-weight-normal, 400)}.main-layout .task-list-item.enabled label{cursor:pointer}.header-anchor{text-decoration:none!important;vertical-align:top;font-size:.7em;opacity:0;transition:all .2s ease}h1:hover .header-anchor,h2:hover .header-anchor,h3:hover .header-anchor,h4:hover .header-anchor,h5:hover .header-anchor,h6:hover .header-anchor{vertical-align:top;font-size:1em;text-decoration:none!important;opacity:.5}.code-wrapper{position:relative}.copy-button{position:absolute;top:8px;right:30px;display:inline-flex;align-items:center;justify-content:center;padding:6px;background:#09090a;border:1px solid #09090a;border-radius:4px;color:#7b98da;opacity:.6;font-size:large;z-index:10;transition:all 1s ease}.copy-button:hover{color:#f5d49e;border-color:transparent;opacity:1;font-size:x-large}.copy-button svg{cursor:crosshair;width:19px;height:19px;stroke:#f5d49e;opacity:.4;transition:all .5s ease;transform-origin:center}.copy-button:hover svg{opacity:.97;fill:#f5d49e;transform:scale(1.25)}.copy-button[data-tooltip]:before{content:attr(data-tooltip);position:absolute;bottom:100%;right:0;margin-bottom:8px;padding:4px 8px;background:#1a202c;color:#bbb;font-size:9px;white-space:nowrap;border-radius:6px;opacity:.4;visibility:hidden;transition:all .6s ease}.copy-button[data-tooltip]:hover:before{opacity:1;visibility:visible}.copy-button.copied{border-color:#b5f700;transition:all .6s ease}.copy-button.copied svg{stroke:#b5f700}pre{position:relative;padding-top:1.25rem!important;padding-left:1.75em!important}.language-label{position:absolute;top:15px;right:60px;background:#09090a;font-size:12px;font-family:Satoshi,Author,SF Pro Display;border-radius:0 4px;opacity:.4;color:#f5d49e;cursor:pointer}.language-label:hover{opacity:.8}.tip,.note,.hint,.warning,.caution,.important{margin:1em 2em;border-left:4px solid #d0d7de;border-radius:7px;overflow:hidden;display:block;align-items:center;padding:1em .5em .1em}.custom-block-title{position:relative;font-size:.9em;font-weight:500;align-self:start;padding:1em;color:#dddb}.tip>p,.note>p,.hint>p,.warning>p,.caution>p,.important>p{font-size:.95em;font-weight:500;padding:10px}.note{border-left-color:#0969da;background:#456af010}.tip{border-left-color:#1a7f37;background:#54f39c10}.hint{border-left-color:#f6c02e;background:#8cd0dd86}.important{border-left-color:#8250df;background:#6654f110}.warning{border-left-color:#9a6700;background:#f5ae4410}.caution{border-left-color:#cf222e;background:#ed386b10}::selection{background-color:#91919150}::-moz-selection{background-color:#91919130}.scrollable{overflow:scroll;scrollbar-width:none;-ms-overflow-style:none}.scrollable::-webkit-scrollbar{display:none}nav{cursor:var(--crosshair);border-radius:7px}nav>ul>li:nth-child(1){display:none}.toc-item-header{font-family:SF Pro Text,Symbols Nerd Font;font-size:.9em;padding:.33em;text-rendering:optimizeLegibility!important;font-weight:500}.toc-item-row>a{font-family:SF Pro Text,Symbols Nerd Font;font-size:.9em;padding:.33em;text-rendering:optimizeLegibility!important;font-weight:400}li:has(.toc-item-row:nth-of-type(2)){font-weight:500}.toc-container{color:#ecf0f1;text-decoration:none;height:80vh;align-self:center;min-width:215px;mask-image:linear-gradient(to bottom,transparent 0%,black 10%,black 90%,transparent 100%);-webkit-mask-image:linear-gradient(to bottom,transparent 0%,black 10%,black 90%,transparent 100%)}.toc-container ul{list-style-type:none;padding-left:0;margin:0;padding-top:2.5em;padding-bottom:2.5em;color:#ecf0f1;text-decoration:none;align-self:center;min-width:215px;mask-image:linear-gradient(to bottom,transparent 0%,black 5%,black 95%,transparent 100%);-webkit-mask-image:linear-gradient(to bottom,transparent 0%,black 5%,black 95%,transparent 100%)}.toc-container ul{list-style-type:none;padding-left:0;margin:0}.toc-container li{margin-bottom:2px}.toc-item-row{display:flex;align-items:center;min-height:20px;width:200px}.toc-item-row:before{scale:1;transition:all .35s ease}.toc-item-row:hover{transform:scaleX(.99) translate(-5px);transition:all .35s ease;box-shadow:6px #05050520}.toc-item-row:active{transform:scaleY(.8);transition:all .1s ease-in-out}.toc-toggle-button{background:none;border:none;color:inherit;cursor:var(--crosshair);padding:0 2px 0 0;margin-right:4px;font-size:.5em;line-height:1;min-width:16px;text-align:center;flex-shrink:0}.toc-toggle-button:hover{opacity:.8;transform:scale(1.2)}.toc-toggle-placeholder{display:inline-block;min-width:16px;margin-right:4px;flex-shrink:0}.toc-item-link,header{text-decoration:none!important;display:block;padding:3px 3px 3px 0;border-radius:7px;flex-grow:1;white-space:nowrap;text-overflow:ellipsis;line-height:1.4}.toc-item-link:hover{text-decoration:none;background-color:#ffffff14}.toc-item-link.active{text-decoration:none;font-weight:700;background-color:#3498db26}header{cursor:var(--crosshair)}header[style*="cursor: var(--crosshair)"]{cursor:var(--crosshair)}header[style*="cursor: crosshair"]:hover{background-color:#ffffff0d}.toc-container ul ul{padding:0}a.toc-item-link{cursor:var(--crosshair)}.toc-toggle-button{transform:rotate(-90deg);background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");background-size:contain;transition:transform .25s ease;align-self:anchor-center;width:16px;height:16px;border-radius:25%}.toc-toggle-button[aria-expanded=false][title=Expand]{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");background-size:contain;transition:transform .45s ease;align-self:anchor-center;border-radius:25%}.toc-toggle-button[aria-expanded=true][title=Collapse]{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");background-size:contain;transition:transform .45s ease;align-self:anchor-center;transform:rotate(-45deg);border-radius:25%}.content-view-wrapper{transition:opacity .25s ease-in-out;opacity:1}.content-view-wrapper.content-fading-out{transition:opacity .25s ease-in-out;opacity:0}.content-view-wrapper.content-faded-in{transition:opacity .25s ease-in-out;opacity:1}.content-loading{display:none}:root{--bgTransparent: rgba(0, 0, 0, 0)}#app{filter:blur(10px);height:100vh;text-align:center;border-radius:7px}html,body,#root{height:100vh;margin:0;overflow:hidden;background:#00000050}#app-container{display:flex;flex-direction:column;color:#ccc;font-family:SF Compact Rounded,Symbols Nerd Font,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Oxygen,Ubuntu,Cantarell,Open Sans,Helvetica Neue,sans-serif;height:100vh;margin:0;overflow:hidden;border-radius:7px}#app-container{display:flex;flex-direction:column;height:100vh;color:#ccc;border-radius:7px;font-family:SF Pro Text,Symbols Nerd Font,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Oxygen,Ubuntu,Cantarell,Open Sans,Helvetica Neue,sans-serif}.main-layout{display:flex;flex-grow:1;height:calc(100% - 40px)}.content-view-wrapper{flex-grow:1;overflow-y:auto;padding:25px 30px;box-sizing:border-box}.hide-scrollbar{scrollbar-width:none!important;-ms-overflow-style:none!important}.hide-scrollbar::-webkit-scrollbar{display:none!important}.code-wrapper{position:relative;margin-bottom:1em}.clip-button svg{width:19px;height:19px;fill:#09090a;stroke:#fff;opacity:.3;transition:all .6s ease-in-out}.clip-button{z-index:100;cursor:var(--crosshair);position:absolute;top:1em;right:2.5em;background:#09090a;border:#09090a;opacity:.3;transition:all .35s ease-in-out}.clip-button:hover svg{opacity:1;fill:#f5d49e;stroke:#f5d49e;transform:scale(1.15);transition:all .35s ease-in-out}button.clip-button:before svg{transform:scale(1);opacity:1;transition:all .15s ease-in-out}button.clip-button:after svg{opacity:1;transform:scaleX(.8);transition:all .15s ease-in-out}button.clip-button:active svg{opacity:1;transform:scaleX(.9);transition:all 90ms ease-in-out}.toc-footer{font-family:Jost,Symbols Nerd Font,sans-serif;font-size:10px;z-index:10;display:flex;position:fixed;justify-content:center;align-items:center;padding:10px 0;bottom:0;left:7px}.openFolderButton{display:flow;border:1px solid #ce966220;align-items:anchor-center;border-radius:7px;background:transparent;opacity:.3;transition:all .25s ease-in-out}.openFolderButton:hover{opacity:.8;background-color:#303030;transform:scaleX(.9)}.openFolderButton:active{opacity:1;background-color:#303030;transform:scaleX(.8);transition:all .1s ease-in-out}.openFolderButton>svg{width:17px;stroke:#ce9662aa;transition:all .3s ease-in-out;padding:1px 1px 1px 5px}details{border-radius:13px;margin-bottom:16px}details summary{font-size:.9em;font-family:SF Compact Rounded,SF Pro Text,Symbols Nerd Font;padding:1em 2em;margin-bottom:1em;cursor:var(--crosshair);border-radius:13px;-webkit-user-select:none;user-select:none;list-style:none;position:relative;box-shadow:5px 5px 5px 5px #00000015;font-weight:500;color:#aaa;background:#000003cc;transition:background .4s ease,color .4s ease,transform .2s ease}details summary:hover{background:#000003dd;transform:scaleY(.9);font-size:.9em;font-family:SF Compact Rounded,SF Pro Text,Symbols Nerd Font;padding:1em 2em;margin-bottom:1em;cursor:var(--crosshair);border-radius:13px;-webkit-user-select:none;user-select:none;list-style:none;position:relative;box-shadow:5px 5px 5px 5px #00000015;font-weight:500;color:#aaa;background:#000003cc;transition:background .4s ease,color .4s ease,transform .2s ease}details summary:hover{background:#000003dd;transform:scaleY(.9);box-shadow:5px 5px 5px 5px #00000015}details summary:active{transform:scaleY(.8);box-shadow:5px 5px 5px 5px #00000015}details summary::-webkit-details-marker{display:none}details summary:before{content:"";position:absolute;right:16px;top:50%;transform:translateY(-50%);width:20px;height:20px;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");background-size:contain;transition:transform .25s ease}details[open] summary:before{transform:translateY(-50%) rotate(180deg)}.details-content{padding:0 16px;overflow:hidden;will-change:height;transition:height .4s ease}.plus-minus summary:before{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='12' y1='5' x2='12' y2='19'%3E%3C/line%3E%3Cline x1='5' y1='12' x2='19' y2='12'%3E%3C/line%3E%3C/svg%3E")}.plus-minus[open] summary:before{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='5' y1='12' x2='19' y2='12'%3E%3C/line%3E%3C/svg%3E");transform:translateY(-50%)}.content-area{transition:opacity .3s ease-in-out}.content-area.fading-out{opacity:0}.content-area.fading-in{opacity:1}@keyframes ripple-radius{to{r:12}}@keyframes ripple-opacity{to{opacity:0}}
```

## `frontend\src\App.css`

```css
:root {
	--bgTransparent: rgba(0, 0, 0, 0);
}

#app {
	height: 100vh;
	text-align: center;
	filter: blur(10px);
	height: 100vh;
	text-align: center;
	border-radius: 7px;
}

html,
body,
#root {
	/* Ensure #root also takes full height */
	height: 100vh;
	margin: 0;
	overflow: hidden;
	background: #00000050;
	/* Prevent body scrollbars if children manage their own */
}

#app-container {
	display: flex;
	flex-direction: column;
	height: 100vh;
	/* background: var(--bgColor-default); */
	color: #ccc;
	font-family:
		"SF Compact Rounded",
		"Symbols Nerd Font",
		-apple-system,
		BlinkMacSystemFont,
		"Segoe UI",
		Roboto,
		Oxygen,
		Ubuntu,
		Cantarell,
		"Open Sans",
		"Helvetica Neue",
		sans-serif;
	/* Ensure #root also takes full height */
	height: 100vh;
	margin: 0;
	overflow: hidden;
	/* background: var(--bgColor-default); */
	border-radius: 7px;
	/* Prevent body scrollbars if children manage their own */
}

#app-container {
	display: flex;
	flex-direction: column;
	height: 100vh;
	/* background: var(--bgColor-default); */
	color: #ccc;
	border-radius: 7px;
	font-family:
		"SF Pro Text",
		"Symbols Nerd Font",
		-apple-system,
		BlinkMacSystemFont,
		"Segoe UI",
		Roboto,
		Oxygen,
		Ubuntu,
		Cantarell,
		"Open Sans",
		"Helvetica Neue",
		sans-serif;
}

.main-layout {
	display: flex;
	flex-grow: 1;
	/* Takes remaining height after title bar */
	height: calc(100% - 40px);
	/* Adjust 30px if title bar height changes */
	/* overflow: hidden; */
	/* Children will manage their own scroll */
}

/* TableOfContents component will have its own width and scroll */

.content-view-wrapper {
	flex-grow: 1;
	overflow-y: auto;
	/* This is where the content scrolls */
	padding: 25px 30px;
	/* Ample padding around content */
	/* background-color: #1e1e1e; */
	/* Main content background */
	box-sizing: border-box;
}

.hide-scrollbar {
	scrollbar-width: none !important; /* Firefox */
	-ms-overflow-style: none !important; /* IE and Edge */
}

.hide-scrollbar::-webkit-scrollbar {
	display: none !important; /* Chrome, Safari, Opera */
}

/* ------------------------------------------------------------------------------- */
/* -------------------------- CODEBLOCK STYLING BELOW ---------------------------- */
/* ------------------------------------------------------------------------------- */
/* <div class="code-wrapper"><button class="clip-button" aria-label="Copy to clipboard" title="Copy to clipboard"> */
/* <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" */
/* aria-hidden="true"> */
/* <path */
/* d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"> */
/* </path> */
/* </svg> */
/* </button><span class="language-label">no</span> */
/* <pre><code class="hljs language-no-highlight"> CONTENT WILL GO HERE </code></pre> */
/* </div> */

.code-wrapper {
	position: relative;
	/* For absolute positioning of the button */
	margin-bottom: 1em;
	/* Space between code blocks */
}

.clip-button svg {
	width: 19px;
	height: 19px;
	fill: #09090a;
	stroke: #fff;
	opacity: 0.3;
	transition: all 600ms ease-in-out;
}

.clip-button {
	z-index: 100;
	cursor: var(--crosshair);
	position: absolute;
	top: 1em;
	right: 2.5em;
	background: #09090a;
	border: #09090a;
	opacity: 0.3;
	transition: all 350ms ease-in-out;
}

.clip-button:hover svg {
	opacity: 1;
	fill: #f5d49e;
	stroke: #f5d49e;
	transform: scale(1.15);
	transition: all 350ms ease-in-out;
}

button.clip-button:before svg {
	transform: scale(1);
	opacity: 1;
	transition: all 150ms ease-in-out;
}

button.clip-button:after svg {
	opacity: 1;
	transform: scale(0.8, 1);
	transition: all 150ms ease-in-out;
}

button.clip-button:active svg {
	opacity: 1;
	transform: scale(0.9, 1);
	transition: all 90ms ease-in-out;
}

.toc-footer {
	font-family: "Jost", "Symbols Nerd Font", sans-serif;
	font-size: 10px;
	z-index: 10;
	display: flex;
	position: fixed;
	justify-content: center;
	align-items: center;
	padding: 10px 0;
	bottom: 0px;
	left: 7px;
}

.openFolderButton {
	display: flow;
	border: 1px solid #ce966220;
	align-items: anchor-center;
	border-radius: 7px;
	/* margin-top: 25px;
	margin-left: 45px; */
	background: transparent;
	opacity: 0.3;
	transition: all 250ms ease-in-out;
}

.openFolderButton:hover {
	opacity: 0.8;
	background-color: #303030;
	transform: scale(0.9, 1);
}

.openFolderButton:active {
	opacity: 1;
	background-color: #303030;
	transform: scale(0.8, 1);
	transition: all 100ms ease-in-out;
}

.openFolderButton > svg {
	width: 17px;
	stroke: #ce9662aa;
	transition: all 300ms ease-in-out;
	padding: 1px;
	padding-left: 5px;
}

/* --------------------------------------------------------------------- */
/* -------------------------- CUSTOM DETAILS TAGS ---------------------- */
/* --------------------------------------------------------------------- */
details {
	border-radius: 13px;
	margin-bottom: 16px;
}

/* Remove default triangle marker */
details summary {
	font-size: 0.9em;
	font-family: "SF Compact Rounded", "SF Pro Text", "Symbols Nerd Font";
	padding: 1em 2em;
	margin-bottom: 1em;
	cursor: var(--crosshair);
	border-radius: 13px;
	user-select: none;
	list-style: none;
	position: relative;
	box-shadow: 5px 5px 5px 5px #00000015;
	font-weight: 500;
	color: #aaa;
	background: #000003cc;
	transition:
		background 400ms ease,
		color 400ms ease,
		transform 200ms ease;
}

details summary:hover {
	background: #000003dd;
	transform: scale(1, 0.9);
	box-shadow: 5px 5px 5px 5px #00000015;
	font-size: 0.9em;
	font-family: "SF Compact Rounded", "SF Pro Text", "Symbols Nerd Font";
	padding: 1em 2em;
	margin-bottom: 1em;
	cursor: var(--crosshair);
	border-radius: 13px;
	user-select: none;
	list-style: none;
	position: relative;
	box-shadow: 5px 5px 5px 5px #00000015;
	font-weight: 500;
	color: #aaa;
	background: #000003cc;
	transition:
		background 400ms ease,
		color 400ms ease,
		transform 200ms ease;
}

details summary:hover {
	background: #000003dd;
	transform: scale(1, 0.9);
	box-shadow: 5px 5px 5px 5px #00000015;
}

details summary:active {
	transform: scale(1, 0.8);
	box-shadow: 5px 5px 5px 5px #00000015;
}

/* Remove default triangle in Safari */
details summary::-webkit-details-marker {
	display: none;
}

/* Create custom icon */
details summary::before {
	content: "";
	position: absolute;
	right: 16px;
	top: 50%;
	transform: translateY(-50%);
	width: 20px;
	height: 20px;
	background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
	background-size: contain;
	transition: transform 0.25s ease;
}

details[open] summary::before {
	transform: translateY(-50%) rotate(180deg);
}

.details-content {
	padding: 0 16px;
	overflow: hidden;
	will-change: height;
	transition: height 0.4s ease;
}

/* Different icon styles - uncomment to try them */
.plus-minus summary::before {
	background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='12' y1='5' x2='12' y2='19'%3E%3C/line%3E%3Cline x1='5' y1='12' x2='19' y2='12'%3E%3C/line%3E%3C/svg%3E");
}

.plus-minus[open] summary::before {
	background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='5' y1='12' x2='19' y2='12'%3E%3C/line%3E%3C/svg%3E");
	transform: translateY(-50%);
}

.content-area {
	transition: opacity 0.3s ease-in-out;
}
.content-area.fading-out {
	opacity: 0;
}
.content-area.fading-in {
	opacity: 1;
}
/* Add to your App.css or index.css or style.css */
@keyframes ripple-radius {
	to {
		r: 12; /* Or whatever radius makes sense for your 24x24 viewBox */
	}
}
@keyframes ripple-opacity {
	to {
		opacity: 0;
	}
}
```

## `frontend\src\App.jsx`

```
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
```

## `frontend\src\components\TableOfContents.css`

```css
/* frontend/src/components/TableOfContents.css */

.scrollable {
	overflow: scroll;
	scrollbar-width: none;
	/* Firefox */
	-ms-overflow-style: none;
	/* IE 10+ */
}

.scrollable::-webkit-scrollbar {
	display: none;
	/* Chrome, Safari, Opera */
}

nav {
	cursor: var(--crosshair);
	border-radius: 7px;
}

/* FIRST TOC ITEM → should be 'Summary' */
nav > ul > li:nth-child(1) {
	display: none;
}

.toc-item-header {
	font-family: "SF Pro Text", "Symbols Nerd Font";
	font-size: 0.9em;
	padding: 0.33em;
	text-rendering: optimizeLegibility !important;
	font-weight: 500;
}
.toc-item-row>a {
	font-family: "SF Pro Text", "Symbols Nerd Font";
	font-size: 0.9em;
	padding: 0.33em;
	text-rendering: optimizeLegibility !important;
	font-weight: 400;
}
li:has(.toc-item-row:nth-of-type(2)) {
	font-weight: 500;
}

.toc-container {
	/* Keep your existing styles */
	color: #ecf0f1;
	text-decoration: none;
	height: 80vh;
	align-self: center;
	min-width: 215px;
	/* background: #161616; Disabled for consistent transparency */
	/* Add these properties for the fade effect */
	mask-image: linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%);
	-webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%);
}

.toc-container ul {
	/* background: linear-gradient(to left #16161650, to right #16161680); */
	list-style-type: none;
	padding-left: 0;
	/* Base ul has no padding, indentation is per item */
	margin: 0;
	padding-top: 2.5em;
	padding-bottom: 2.5em;
	/* Keep your existing styles */
	color: #ecf0f1;
	text-decoration: none;
	align-self: center;
	min-width: 215px;
	/* background: #161616; */
	/* Add these properties for the fade effect */
	mask-image: linear-gradient(to bottom, transparent 0%, black 5%, black 95%, transparent 100%);
	-webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 5%, black 95%, transparent 100%);
	/* Add some padding to make room for the fade effect */
}

.toc-container ul {
	/* background: #161616; */
	list-style-type: none;
	padding-left: 0;
	/* Base ul has no padding, indentation is per item */
	margin: 0;
}

.toc-container li {
	margin-bottom: 2px;
}

.toc-item-row {
	display: flex;
	align-items: center;
	/* padding-left is now applied via inline style for dynamic indentation */
	min-height: 20px;
	/* Ensure consistent row height */
	width: 200px;
}

.toc-item-row::before {
	scale: 1;
	transition: all 350ms ease;
}

.toc-item-row:hover {
	transform: scaleX(0.99) translateX(-5px);
	transition: all 350ms ease;
	box-shadow: 6px #05050520;
}

.toc-item-row:active {
	transform: scaleY(0.8);
	transition: all 100ms ease-in-out;
}

.toc-toggle-button {
	background: none;
	border: none;
	color: inherit;
	/* Or a specific color for the toggle */
	cursor: var(--crosshair);
	padding: 0 2px 0 0;
	/* Adjust as needed */
	margin-right: 4px;
	/* Space between toggle and text */
	font-size: 0.5em;
	/* Adjust for desired icon size */
	line-height: 1;
	min-width: 16px;
	/* Ensure it's easily clickable */
	text-align: center;
	flex-shrink: 0;
	/* Prevent shrinking */
}

.toc-toggle-button:hover {
	opacity: 0.8;
	transform: scale(1.2);
}

.toc-toggle-placeholder {
	display: inline-block;
	min-width: 16px;
	/* Match button width for alignment */
	margin-right: 4px;
	/* Match button margin */
	flex-shrink: 0;
}

.toc-item-link,
header {
	text-decoration: none !important;
	/* color: #bdc3c7; */
	display: block;
	padding: 3px 3px 3px 0;
	/* Padding for the text area */
	border-radius: 7px;
	flex-grow: 1;
	/* Allow text to take remaining space */
	white-space: nowrap;
	text-overflow: ellipsis;
	line-height: 1.4;
}

.toc-item-link:hover {
	text-decoration: none;
	/* color: #ffffff; */
	background-color: rgba(255, 255, 255, 0.08);
}

.toc-item-link.active {
	text-decoration: none;
	font-weight: bold;
	/* color: #3498db; */
	/* Active link color */
	background-color: rgba(52, 152, 219, 0.15);
}

header {
	/* color: #95a5a6; */
	cursor: var(--crosshair);
}

header[style*="cursor: var(--crosshair)"] {
	cursor: var(--crosshair);
}

header[style*="cursor: crosshair"]:hover {
	background-color: rgba(255, 255, 255, 0.05);
}

/* Nested lists do not need extra padding-left here,
   as indentation is handled by 'paddingLeft' on 'toc-item-row' */
.toc-container ul ul {
	padding: 0px;

	/* No specific padding needed here if item rows handle it */
}

a.toc-item-link {
	cursor: var(--crosshair);
}

.toc-toggle-button {
	transform: rotate(-90deg);
	background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
	background-size: contain;
	transition: transform 250ms ease;
	align-self: anchor-center;
	width: 16px;
	height: 16px;
	border-radius: 25%;
}

.toc-toggle-button[aria-expanded="false"][title="Expand"] {
	background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
	background-size: contain;
	transition: transform 450ms ease;
	align-self: anchor-center;
	border-radius: 25%;
}

.toc-toggle-button[aria-expanded="true"][title="Collapse"] {
	background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
	background-size: contain;
	transition: transform 450ms ease;
	align-self: anchor-center;
	transform: rotate(-45deg);
	border-radius: 25%;
	/* background-color: #3d3d3daa; */
}

.content-view-wrapper {
	transition: opacity 250ms ease-in-out;
	opacity: 1;
	/* Default visible */
}

.content-view-wrapper.content-fading-out {
	transition: opacity 250ms ease-in-out;
	opacity: 0;
}

.content-view-wrapper.content-faded-in {
	transition: opacity 250ms ease-in-out;
	/* Can be the default state if not fading out or loading */
	opacity: 1;
}

/* Ensure loading indicator is visible and content is hidden during load */
.content-loading {
	display: none;
	/* Styles for your loading indicator */
}
```

## `frontend\src\components\TableOfContents.jsx`

```
// frontend/src/components/TableOfContents.jsx
import React, { useState } from "react"; // Import useState
import "./TableOfContents.css";
// Import the new Go function that will be bound by Wails
// import { ShowTOCContextMenu } from "../../wailsjs/go/main/App";

const TOCItemLink = ({ item, onItemClick, currentPath, level }) => {
	const isCurrent = item.path && item.path === currentPath;
	const effectiveLevel = typeof level === "number" ? level : item.level || 0;
	const hasChildren = item.children && item.children.length > 0;

	// State for collapsed/expanded status of this item's children
	// Default to collapsed (true). Set to false if you want them expanded by default.
	const [isCollapsed, setIsCollapsed] = useState(true);

	// Only make items with .md paths clickable for content loading AND context menu.
	const isClickable = item.path && item.path.toLowerCase().endsWith(".md");

	// const handleContextMenu = (event) => {
	// 	if (isClickable && item.path) {
	// 		event.preventDefault(); // Prevent default browser context menu
	// 		ShowTOCContextMenu(item.path); // Call the Go function
	// 	}
	// };

	const handleToggleCollapse = (e) => {
		// Prevent the click from propagating to the link if the toggle is part of the link area
		e.stopPropagation();
		setIsCollapsed(!isCollapsed);
	};

	// Style for the entire row (toggle + link/header) to handle indentation
	const itemRowStyle = { paddingLeft: `${effectiveLevel * 15 + 10}px` };

	return (
		<li>
			<div className="toc-item-row scrollable" style={itemRowStyle}>
				{hasChildren ? (
					<button onClick={handleToggleCollapse} className="toc-toggle-button" aria-expanded={!isCollapsed} title={isCollapsed ? "Expand" : "Collapse"}>
						{isCollapsed ? "" : ""}
					</button>
				) : (
					<span className="toc-toggle-placeholder"></span> /* For alignment */
				)}

				{isClickable ? (
					<a
						href={`#${item.path}`}
						className={`toc-item-link ${isCurrent ? "active" : ""}`}
						onClick={(e) => {
							e.preventDefault();
							onItemClick(item.path);
						}}
						// onContextMenu={handleContextMenu}
						title={item.path}
					>
						{item.title}
					</a>
				) : (
					<span
						className="toc-item-header scrollable"
						// If non-clickable headers can also be parents, allow toggling them
						onClick={hasChildren ? handleToggleCollapse : undefined}
						style={{ cursor: hasChildren ? "var(--crosshair)" : "default" }}
					>
						{item.title}
					</span>
				)}
			</div>

			{hasChildren &&
				!isCollapsed && ( // Conditionally render children
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
			<div className="toc-container scrollable">
				<p>Table of Contents is empty or could not be loaded.</p>
			</div>
		);
	}

	return (
		<nav className="toc-container scrollable">
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

## `frontend\src\style.css`

```css
:root {
	--crosshair:
		url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAcCAYAAAByDd+UAAABdWlDQ1BrQ0dDb2xvclNwYWNlRGlzcGxheVAzAAAokXWQvUvDUBTFT6tS0DqIDh0cMolD1NIKdnFoKxRFMFQFq1OafgltfCQpUnETVyn4H1jBWXCwiFRwcXAQRAcR3Zw6KbhoeN6XVNoi3sfl/Ticc7lcwBtQGSv2AijplpFMxKS11Lrke4OHnlOqZrKooiwK/v276/PR9d5PiFlNu3YQ2U9cl84ul3aeAlN//V3Vn8maGv3f1EGNGRbgkYmVbYsJ3iUeMWgp4qrgvMvHgtMunzuelWSc+JZY0gpqhrhJLKc79HwHl4plrbWD2N6f1VeXxRzqUcxhEyYYilBRgQQF4X/8044/ji1yV2BQLo8CLMpESRETssTz0KFhEjJxCEHqkLhz634PrfvJbW3vFZhtcM4v2tpCAzidoZPV29p4BBgaAG7qTDVUR+qh9uZywPsJMJgChu8os2HmwiF3e38M6Hvh/GMM8B0CdpXzryPO7RqFn4Er/QcXKWq8UwZBywAAAARjSUNQDA0AAW4D4+8AAAA4ZVhJZk1NACoAAAAIAAGHaQAEAAAAAQAAABoAAAAAAAKgAgAEAAAAAQAAABygAwAEAAAAAQAAABwAAAAAR3XWmAAAA+5JREFUSA29lV1IU2EYx882nfNjm9P5sa2JH2FqKdIqMuwmCipoBmEQiGAU0k3deGt5FVEZ3YgjuioIlGgg1IWUlQPLfTSX0xK3uSl+z6/pdN/r/4qDcu60rdmBwznnPe/7/J7/8z7P81Lj4+O8xcVFMfWfLubg4CBls9nuA9oeDAaT95vLIICOjg5pWVlZo1QqdQiFwhcCgcDHYDCc+wHfBoYMd3d3VwIqT01NramoqLBA8bOUlBRj6H8inn8AicGhoaEHgUBA6vf7j5WWlgZ5PN5tqO1NBIzYYO42tLm5mVNQUHAa0A/Dw8MbuJ5A6eXd8+L9DgO63e6FlZUVj1gsPpeenq5DUnnm5+eVDofjLcBH4wWF1oUBodC6sLDwzePxHMR+XkBINXq9Xre2tnYR4I9w6EpocTzPMKDX61XZ7fZRl8sVxA2m9CyXy9UaDIah1dVVHqAvofRMPDCyJgxYV1c3try8/AlKnQijZ319vRjQWmSr2mQy/VhaWgoC/gjgvHigYUBkpL+pqakfaowAWra2tigoPVxYWFgJgAoNwszhcLg+n68RSmNuFGHAHa8D2MfnUDOZlJREOZ1OCoDjEonkAPbyq8ViyUMUHqJD9QAqjUVpJCCFcngNhTaUB0VuhNazs6eZgCmnp6d9cOo8evErQLnRQiMCm5ub1wDVI4koJpNJHBhFmIUolSP5+fne2dnZfoxRSLBaKL33z0BiAEZHoYxC13HivRfhzYXKQ8haEW4T9nMFUaCmpqbuIMlORQONqJAs7urq+mI2mz8DaIJhOzKVhSeTxWJV8/l8olpP5iGxVtVq9U2EltYemUs7YWRkxKPRaK6jHBTYR3JRJMRQLQFQxGazLVC5gczmp6WlVcCBbGKU7qIFkoWdnZ2WhoYGBYw5CIxASdaiE8mysrIcGP+JzE2amZk5MTk5eYMORv79FRgygD0khrc/USIknOLMzEwBHBiDI16EU63T6Uq0Wi1tbUYNVKlUhrm5OQNAQaISSUJqszojI2MKmWpHM6jCcbYhk8nCjryQ0+TJ+v2D7h0KveXl5TokUCmUFe6ENzc7O1uPcHIwXgIHTiLUZoVCYYhkK2qFxEB7e7sGxjthlEII/XDCgYSpQblYUS5BUiKoyUuRYGQ8JiBZoFQqe5C176HGjfBa0P5kaO6bpGwAp3B8SenKI2ag1Wp19fX1XZuYmHiKsNpxarjQfarx/g5QN2qSRyeEdoOJIrqrpaXlKurxFpp6pUgkemw0GjMAZLS2tt4lp85ea6NOmr0WDwwMjBQXF39HwtiTk5OrioqKOtBx3sjlct9e8xM6Vl9fn9PW1sZOqNFEGPsFi9JpLBWNZgMAAAAASUVORK5CYII="),
		auto;
}

.markdown-content {
	max-width: 1050px;
	justify-self: anchor-center;
	font-family: "SF Pro Text", "Symbols Nerd Font", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
	scroll-behavior: smooth;
	text-rendering: optimizeLegibility;
}

.react-ui {
	width: 100% !important;
	padding: 0px;
	margin: 0px;
	background-color: #00000000;
	overflow: hidden;
	scroll-behavior: smooth !important;
	border-radius: 7px;
}

html {
	text-rendering: optimizeLegibility !important;
	width: 100%;
	background-color: #00000000;
	/* text-align: center; */
	color: #c1c1c1;
}

@font-face {
	font-family: "Symbols Nerd Font";
	font-style: normal;
	font-weight: 400;
	src:
		local(""),
		url("assets/fonts/SymbolsNerdFont-Regular.ttf") format("ttf");
}

body {
	margin: 0;
	color: #ccc;
	font-family:
		"SF Pro Text",
		"Symbols Nerd Font",
		-apple-system,
		BlinkMacSystemFont,
		"Segoe UI",
		"Roboto",
		"Oxygen",
		"Ubuntu",
		"Fira Sans",
		"Droid Sans",
		"Helvetica Neue",
		sans-serif;
}

#app {
	width: auto;
	height: 100vh;
	text-align: center;
}

/* Make sure body/html have no margin and height: 100% */
html,
body,
#root {
	width: 100%;
	height: 100vh;
	margin: 0;
	padding: 0;
	overflow: hidden;
	/* Prevent scrollbars on the main body */
	font-family:
		"SF Pro Rounded",
		"Symbols Nerd Font",
		-apple-system,
		BlinkMacSystemFont,
		"Segoe UI",
		"Roboto",
		"Oxygen",
		"Ubuntu",
		"Fira Sans",
		"Droid Sans",
		"Helvetica Neue",
		sans-serif;
	/* Background for the main app window (behind the iframe) */
	/* Use a solid color or keep transparent depending on your needs */
	/* background-color: #11111120; */
	/* Example light grey */
	background-color: transparent;
	/* If you want window transparency */
}

#app-container {
	display: flex;
	flex-direction: column;
	height: 100%;
	width: 100%;
	/* border: 1px solid #555; Optional: for visualizing frameless window */
	/* border-radius: 8px; Optional: rounded corners */
	overflow: hidden;
	/* Important for rounded corners */
	box-sizing: border-box;
	cursor: var(--crosshair), auto;
}

.title-bar {
	background: #16161680;
	display: flex;
	justify-content: space-between;
	align-items: center;
	height: 24px;
	cursor: grab, auto;
	/* Adjust height as needed */
	/* Dark title bar */
	color: rgba(250, 165, 80, 0.314);
	padding: 1px 8px;
	flex-shrink: 0;
	/* Prevent shrinking */
	/* --wails-draggable: drag; applied inline for specificity if needed */
	user-select: none;
	cursor: var(--crosshair);
	/* Prevent text selection */
}

.window-controls {
	display: flex;
	/* --wails-draggable: no-drag; */
	/* Ensure controls aren't draggable */
}

.window-button {
	background: none;
	border: none;
	border-radius: 5px;
	/* margin-left: 2px; */
	margin-right: 1.5px;
	height: 14px;
	line-height: 1.1em;
	font-size: 11px;
	cursor: var(--crosshair);
	font-family: "Segoe MDL2 Assets", "Symbols Nerd Font", "Apple Symbols", "system-ui";
	-webkit-app-region: no-drag;
	/* Important for Wails frameless */
	transition: all 300ms ease-in;
}

.window-button.close:hover {
	background: #cf5e5970;
	/* Red for close hover */
}

.window-button.minimize:hover {
	background: #80808040;
}

.title-bar-text {
	font-family: "Jost", "Symbols Nerd Font", sans-serif;
	font-size: larger;
}

.content-area {
	flex-grow: 1;
	/* Take remaining space */
	position: relative;
	/* For loading indicator positioning */
	/* overflow: hidden;
	/* Ensure iframe stays within bounds */
	cursor: var(--crosshair), auto;
}

.loading-indicator {
	position: absolute;
	top: 0;
	left: 0;
	width: 100%;
	height: 100vh;
	display: flex;
	justify-content: center;
	align-items: center;
	background-color: rgba(16, 16, 16, 0);
	z-index: 10;
}

article {
	display: flow;
	max-width: 1100px;
	min-width: 650px;
	justify-content: center;
	text-rendering: optimizeLegibility !important;
}

.main-layout {
	--base-size-4: 0.25rem;
	--base-size-8: 0.5rem;
	--base-size-16: 1rem;
	--base-size-24: 1.5rem;
	--base-size-40: 2.5rem;
	--base-text-weight-normal: 400;
	--base-text-weight-medium: 500;
	--base-text-weight-semibold: 600;
	--fontStack-monospace: "SFMono Nerd Font", "SF Mono", "RedditMono Nerd Font", "Symbols Nerd Font", Menlo, monospace;
	--fgColor-accent: Highlight;
}

i[class^="devicon-"] {
	font-size: 2rem;
}

@media (prefers-color-scheme: dark) {

	html,
	[data-theme="dark"] {
		color-scheme: dark;
		--focus-outlineColor: #1f6feb;
		--fgColor-default: #f0f6fc;
		--fgColor-muted: #9198a1;
		--fgColor-accent: #4493f850;
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

.main-layout {
	padding: 0px;
	-ms-text-size-adjust: 100%;
	-webkit-text-size-adjust: 100%;
	margin: 0;
	color: var(--fgColor-default);
	background-color: #16161680;
	font-family: "SF Pro Text", "Satoshi Nerd Font", "Symbols Nerd Font", BlinkMacSystemFont, "Segoe UI", Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
	font-size: 16.5px;
	line-height: 1.3;
	word-wrap: break-word;
	overflow-y: scroll;
}

.main-layout .octicon {
	display: inline-block;
	fill: currentColor;
	vertical-align: text-bottom;
}

.main-layout h1:hover .anchor .octicon-link:before,
.main-layout h2:hover .anchor .octicon-link:before,
.main-layout h3:hover .anchor .octicon-link:before,
.main-layout h4:hover .anchor .octicon-link:before,
.main-layout h5:hover .anchor .octicon-link:before,
.main-layout h6:hover .anchor .octicon-link:before {
	width: 16px;
	height: 16px;
	content: " ";
	display: inline-block;
	background-color: currentColor;
	-webkit-mask-image: url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' version='1.1' aria-hidden='true'><path fill-rule='evenodd' d='M7.775 3.275a.75.75 0 001.06 1.06l1.25-1.25a2 2 0 112.83 2.83l-2.5 2.5a2 2 0 01-2.83 0 .75.75 0 00-1.06 1.06 3.5 3.5 0 004.95 0l2.5-2.5a3.5 3.5 0 00-4.95-4.95l-1.25 1.25zm-4.69 9.64a2 2 0 010-2.83l2.5-2.5a2 2 0 012.83 0 .75.75 0 001.06-1.06 3.5 3.5 0 00-4.95 0l-2.5 2.5a3.5 3.5 0 004.95 4.95l1.25-1.25a.75.75 0 00-1.06-1.06l-1.25 1.25a2 2 0 01-2.83 0z'></path></svg>");
	mask-image: url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' version='1.1' aria-hidden='true'><path fill-rule='evenodd' d='M7.775 3.275a.75.75 0 001.06 1.06l1.25-1.25a2 2 0 112.83 2.83l-2.5 2.5a2 2 0 01-2.83 0 .75.75 0 00-1.06 1.06 3.5 3.5 0 004.95 0l2.5-2.5a3.5 3.5 0 00-4.95-4.95l-1.25 1.25zm-4.69 9.64a2 2 0 010-2.83l2.5-2.5a2 2 0 012.83 0 .75.75 0 001.06-1.06 3.5 3.5 0 00-4.95 0l-2.5 2.5a3.5 3.5 0 004.95 4.95l1.25-1.25a.75.75 0 00-1.06-1.06l-1.25 1.25a2 2 0 01-2.83 0z'></path></svg>");
}

.main-layout details,
.main-layout figcaption,
.main-layout figure {
	display: block;
}

.main-layout summary {
	display: list-item;
}

.main-layout [hidden] {
	display: none !important;
}

.main-layout a {
	background-color: transparent;
	text-decoration: none;
	color: #7cc0ede0;
}

a.toc-item-link {
	color: #cecece;
	font-family: "Jost", "Symbols Nerd Font", sans-serif;
	font-weight: 500;
}

.main-layout abbr[title] {
	border-bottom: none;
	-webkit-text-decoration: underline dotted;
	text-decoration: underline dotted;
}

.main-layout b,
.main-layout strong {
	font-weight: var(--base-text-weight-semibold, 600);
}

.main-layout dfn {
	font-style: italic;
}

.main-layout h1 {
	margin: 0.67em 0;
	font-weight: var(--base-text-weight-semibold, 600);
	padding-bottom: 0.3em;
	font-size: 2em;
	border-bottom: 1px solid var(--borderColor-muted);
}

.main-layout mark {
	background-color: #ffee0033;
	color: var(--fgColor-default);
	padding: 3px;
	border-radius: 4px;
}

.main-layout small {
	font-size: 90%;
}

.main-layout sub,
.main-layout sup {
	font-size: 75%;
	line-height: 0;
	position: relative;
	vertical-align: baseline;
}

.main-layout sub {
	bottom: -0.25em;
}

.main-layout sup {
	top: -0.5em;
}

.main-layout img {
	border-style: none;
	max-width: 100%;
	box-sizing: content-box;
}

.main-layout code,
.main-layout kbd,
.main-layout pre,
.main-layout samp {
	font-family: var(--font-family-monospace);
	font-size: 1em;
}

.main-layout figure {
	margin: 1em var(--base-size-40);
}

.main-layout hr {
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

.main-layout input {
	font: inherit;
	margin: 0;
	overflow: visible;
	font-family: inherit;
	font-size: inherit;
	line-height: inherit;
}

.main-layout [type="button"],
.main-layout [type="reset"],
.main-layout [type="submit"] {
	-webkit-appearance: button;
	appearance: button;
}

.main-layout [type="checkbox"],
.main-layout [type="radio"] {
	box-sizing: border-box;
	padding: 0;
}

.main-layout [type="number"]::-webkit-inner-spin-button,
.main-layout [type="number"]::-webkit-outer-spin-button {
	height: auto;
}

.main-layout [type="search"]::-webkit-search-cancel-button,
.main-layout [type="search"]::-webkit-search-decoration {
	-webkit-appearance: none;
	appearance: none;
}

.main-layout ::-webkit-input-placeholder {
	color: inherit;
	opacity: 0.54;
}

.main-layout ::-webkit-file-upload-button {
	-webkit-appearance: button;
	appearance: button;
	font: inherit;
}

.main-layout a:hover {
	text-decoration: underline;
}

.main-layout ::placeholder {
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
	background-color: #0b182a;
	font-size: 15px;
	margin: 0;
	padding: 0.4em 0.35em 0.4em 0.35em;
}

table tr td {
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

.main-layout table tr:nth-child(2n),
.main-layout table tr {
	transition: all 300ms ease-in-out;
}

.main-layout table tr:hover {
	background-color: #f8f8f81b;
}

.main-layout table tr:nth-child(2n):hover {
	background-color: #f8f8f81b;
}

.main-layout details summary {
	cursor: pointer;
}

.main-layout a:focus,
.main-layout [role="button"]:focus,
.main-layout input[type="radio"]:focus,
.main-layout input[type="checkbox"]:focus {
	outline: 2px solid var(--focus-outlineColor);
	outline-offset: -2px;
	box-shadow: none;
}

.main-layout a:focus:not(:focus-visible),
.main-layout [role="button"]:focus:not(:focus-visible),
.main-layout input[type="radio"]:focus:not(:focus-visible),
.main-layout input[type="checkbox"]:focus:not(:focus-visible) {
	outline: solid 1px transparent;
}

.main-layout a:focus-visible,
.main-layout [role="button"]:focus-visible,
.main-layout input[type="radio"]:focus-visible,
.main-layout input[type="checkbox"]:focus-visible {
	outline: 2px solid var(--focus-outlineColor);
	outline-offset: -2px;
	box-shadow: none;
}

.main-layout a:not([class]):focus,
.main-layout a:not([class]):focus-visible,
.main-layout input[type="radio"]:focus,
.main-layout input[type="radio"]:focus-visible,
.main-layout input[type="checkbox"]:focus,
.main-layout input[type="checkbox"]:focus-visible {
	outline-offset: 0;
}

.main-layout kbd {
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

.main-layout h1,
.main-layout h2,
.main-layout h3,
.main-layout h4,
.main-layout h5,
.main-layout h6 {
	margin-top: var(--base-size-24);
	margin-bottom: var(--base-size-16);
	font-weight: var(--base-text-weight-semibold, 600);
	line-height: 1.25;
}

.main-layout h2 {
	font-weight: var(--base-text-weight-semibold, 600);
	padding-bottom: 0.3em;
	font-size: 1.5em;
	border-bottom: 1px solid var(--borderColor-muted);
}

.main-layout h3 {
	font-weight: var(--base-text-weight-semibold, 600);
	font-size: 1.25em;
}

.main-layout h4 {
	font-weight: var(--base-text-weight-semibold, 600);
	font-size: 1em;
}

.main-layout h5 {
	font-weight: var(--base-text-weight-semibold, 600);
	font-size: 0.875em;
}

.main-layout h6 {
	font-weight: var(--base-text-weight-semibold, 600);
	font-size: 0.85em;
	color: var(--fgColor-muted);
}

.main-layout p {
	margin-top: 0;
	margin-bottom: 10px;
}

.main-layout blockquote {
	margin: 0;
	padding: 0 1em;
	color: var(--fgColor-muted);
	border-left: 0.25em solid var(--borderColor-default);
}

.main-layout ul,
.main-layout ol {
	margin-top: 0;
	margin-bottom: 0;
	padding-left: 2em;
}

.main-layout ol ol,
.main-layout ul ol {
	list-style-type: lower-roman;
}

.main-layout ul ul ol,
.main-layout ul ol ol,
.main-layout ol ul ol,
.main-layout ol ol ol {
	list-style-type: lower-alpha;
}

.main-layout dd {
	margin-left: 0;
}

.main-layout tt,
.main-layout code,
.main-layout samp {
	font-family: "SFMono Nerd Font", "SF Mono", Menlo, monospace;
	font-size: 12px;
}

.main-layout pre {
	margin: 1.5em;
	font-family: "SFMono Nerd Font", "SF Mono", "RedditMono Nerd Font", Menlo, monospace;
	font-size: 11.5px;
	/* word-wrap: normal; */
}

.main-layout .octicon {
	display: inline-block;
	overflow: visible !important;
	vertical-align: text-bottom;
	fill: currentColor;
}

.main-layout input::-webkit-outer-spin-button,
.main-layout input::-webkit-inner-spin-button {
	margin: 0;
	appearance: none;
}

.main-layout .mr-2 {
	margin-right: var(--base-size-8, 8px) !important;
}

.main-layout::before {
	display: table;
	content: "";
}

.main-layout::after {
	display: table;
	clear: both;
	content: "";
}

.main-layout>*:first-child {
	margin-top: 0 !important;
}

.main-layout>*:last-child {
	margin-bottom: 0 !important;
}

.main-layout a:not([href]) {
	color: inherit;
	text-decoration: none;
}

.main-layout .absent {
	color: var(--fgColor-danger);
}

.main-layout .anchor {
	float: left;
	padding-right: var(--base-size-4);
	margin-left: -20px;
	line-height: 1;
}

.main-layout .anchor:focus {
	outline: none;
}

.main-layout p,
.main-layout blockquote,
.main-layout ul,
.main-layout ol,
.main-layout dl,
.main-layout table,
.main-layout pre,
.main-layout details {
	margin-top: 0;
	margin-bottom: var(--base-size-16);
}

.main-layout blockquote> :first-child {
	margin-top: 0;
}

.main-layout blockquote> :last-child {
	margin-bottom: 0;
}

.main-layout h1 .octicon-link,
.main-layout h2 .octicon-link,
.main-layout h3 .octicon-link,
.main-layout h4 .octicon-link,
.main-layout h5 .octicon-link,
.main-layout h6 .octicon-link {
	color: var(--fgColor-default);
	vertical-align: middle;
	visibility: hidden;
}

.main-layout h1:hover .anchor,
.main-layout h2:hover .anchor,
.main-layout h3:hover .anchor,
.main-layout h4:hover .anchor,
.main-layout h5:hover .anchor,
.main-layout h6:hover .anchor {
	text-decoration: none;
}

.main-layout h1:hover .anchor .octicon-link,
.main-layout h2:hover .anchor .octicon-link,
.main-layout h3:hover .anchor .octicon-link,
.main-layout h4:hover .anchor .octicon-link,
.main-layout h5:hover .anchor .octicon-link,
.main-layout h6:hover .anchor .octicon-link {
	visibility: visible;
}

.main-layout h1 tt,
.main-layout h1 code,
.main-layout h2 tt,
.main-layout h2 code,
.main-layout h3 tt,
.main-layout h3 code,
.main-layout h4 tt,
.main-layout h4 code,
.main-layout h5 tt,
.main-layout h5 code,
.main-layout h6 tt,
.main-layout h6 code {
	padding: 0 0.2em;
	font-size: inherit;
}

.main-layout summary h1,
.main-layout summary h2,
.main-layout summary h3,
.main-layout summary h4,
.main-layout summary h5,
.main-layout summary h6 {
	display: inline-block;
}

.main-layout summary h1 .anchor,
.main-layout summary h2 .anchor,
.main-layout summary h3 .anchor,
.main-layout summary h4 .anchor,
.main-layout summary h5 .anchor,
.main-layout summary h6 .anchor {
	margin-left: -40px;
}

.main-layout summary h1,
.main-layout summary h2 {
	padding-bottom: 0;
	border-bottom: 0;
}

.main-layout ul.no-list,
.main-layout ol.no-list {
	padding: 0;
	list-style-type: none;
}

.main-layout ol[type="a s"] {
	list-style-type: lower-alpha;
}

.main-layout ol[type="A s"] {
	list-style-type: upper-alpha;
}

.main-layout ol[type="i s"] {
	list-style-type: lower-roman;
}

.main-layout ol[type="I s"] {
	list-style-type: upper-roman;
}

.main-layout ol[type="1"] {
	list-style-type: decimal;
}

.main-layout div>ol:not([type]) {
	list-style-type: decimal;
}

.main-layout ul ul,
.main-layout ul ol,
.main-layout ol ol,
.main-layout ol ul {
	margin-top: 0;
	margin-bottom: 0;
}

.main-layout li>p {
	margin-top: var(--base-size-16);
}

.main-layout li+li {
	margin-top: 0.25em;
}

.main-layout dl {
	padding: 0;
}

.main-layout dl dt {
	padding: 0;
	margin-top: var(--base-size-16);
	font-size: 1em;
	font-style: italic;
	font-weight: var(--base-text-weight-semibold, 600);
}

.main-layout dl dd {
	padding: 0 var(--base-size-16);
	margin-bottom: var(--base-size-16);
}

.main-layout table th {
	font-weight: var(--base-text-weight-semibold, 600);
}

.main-layout table th,
.main-layout table td {
	padding: 6px 13px;
	border: 0px solid var(--borderColor-default);
}

.main-layout table td> :last-child {
	margin-bottom: 0;
}

.main-layout table tr {
	font-family: "Satoshi Nerd Font", sans-serif;
	background-color: var(--bgColor-default);
	border-top: 1px solid var(--borderColor-muted);
}

.main-layout table tr:nth-child(2n) {
	background-color: var(--bgColor-muted);
}

.main-layout table img {
	background-color: transparent;
}

.main-layout img[align="right"] {
	padding-left: 20px;
}

.main-layout img[align="left"] {
	padding-right: 20px;
}

.main-layout .emoji {
	max-width: none;
	vertical-align: text-top;
	background-color: transparent;
}

.main-layout span.frame {
	display: block;
	overflow: hidden;
}

.main-layout span.frame>span {
	display: block;
	float: left;
	width: auto;
	padding: 7px;
	margin: 13px 0 0;
	overflow: hidden;
	border: 1px solid var(--borderColor-default);
}

.main-layout span.frame span img {
	display: block;
	float: left;
}

.main-layout span.frame span span {
	display: block;
	padding: 5px 0 0;
	clear: both;
	color: var(--fgColor-default);
}

.main-layout span.align-center {
	display: block;
	overflow: hidden;
	clear: both;
}

.main-layout span.align-center>span {
	display: block;
	margin: 13px auto 0;
	overflow: hidden;
	text-align: center;
}

.main-layout span.align-center span img {
	margin: 0 auto;
	text-align: center;
}

.main-layout span.align-right {
	display: block;
	overflow: hidden;
	clear: both;
}

.main-layout span.align-right>span {
	display: block;
	margin: 13px 0 0;
	overflow: hidden;
	text-align: right;
}

.main-layout span.align-right span img {
	margin: 0;
	text-align: right;
}

.main-layout span.float-left {
	display: block;
	float: left;
	margin-right: 13px;
	overflow: hidden;
}

.main-layout span.float-left span {
	margin: 13px 0 0;
}

.main-layout span.float-right {
	display: block;
	float: right;
	margin-left: 13px;
	overflow: hidden;
}

.main-layout span.float-right>span {
	display: block;
	margin: 13px auto 0;
	overflow: hidden;
	text-align: right;
}

.main-layout code,
.main-layout tt {
	padding: 0.2em 0.4em;
	margin: 0;
	font-size: 85%;
	white-space: break-spaces;
	background-color: var(--bgColor-neutral-muted);
	border-radius: 7px;
}

.main-layout code br,
.main-layout tt br {
	display: none;
}

.main-layout del code {
	text-decoration: inherit;
}

.main-layout samp {
	font-size: 85%;
}

pre {
	cursor: var(--crosshair);
	margin-left: 1.5em;
	margin-right: 1.5em;
}

.main-layout pre code {
	font-size: 95%;
	overflow-wrap: anywhere;
}

.main-layout pre>code {
	padding: 0;
	margin: 0;
	word-break: normal;
	white-space: break-spaces;
	background: transparent;
	border: 0;
}

.main-layout .highlight {
	margin-bottom: var(--base-size-16);
}

.main-layout .highlight pre {
	margin-bottom: 0;
	word-break: normal;
}

.main-layout .highlight pre,
.main-layout pre {
	padding: var(--base-size-16);
	overflow: inherit;
	font-size: 85%;
	line-height: 1.4;
	color: var(--fgColor-default);
	background-color: #09090a;
	border-radius: 10px;
	box-shadow:
		0 10px 16px 0 rgba(0, 0, 0, 0.2),
		0 6px 20px 0 rgba(0, 0, 0, 0.19) !important;
}

.main-layout pre code,
.main-layout pre tt {
	display: inline;
	max-width: auto;
	padding: 0;
	margin: 0;
	overflow: visible;
	line-height: inherit;
	/* word-wrap: normal; */
	background-color: transparent;
	border: 0;
}

.main-layout .csv-data td,
.main-layout .csv-data th {
	padding: 5px;
	overflow: hidden;
	font-size: 12px;
	line-height: 1;
	text-align: left;
	white-space: nowrap;
}

.main-layout .csv-data .blob-num {
	padding: 10px var(--base-size-8) 9px;
	text-align: right;
	background: var(--bgColor-default);
	border: 0;
}

.main-layout .csv-data tr {
	border-top: 0;
}

.main-layout .csv-data th {
	font-weight: var(--base-text-weight-semibold, 600);
	background: var(--bgColor-muted);
	border-top: 0;
}

.main-layout [data-footnote-ref]::before {
	content: "[";
}

.main-layout [data-footnote-ref]::after {
	content: "]";
}

.main-layout .footnotes {
	font-size: 12px;
	color: var(--fgColor-muted);
	border-top: 1px solid var(--borderColor-default);
}

.main-layout .footnotes ol {
	padding-left: var(--base-size-16);
}

.main-layout .footnotes ol ul {
	display: inline-block;
	padding-left: var(--base-size-16);
	margin-top: var(--base-size-16);
}

.main-layout .footnotes li {
	position: relative;
}

.main-layout .footnotes li:target::before {
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

.main-layout .footnotes li:target {
	color: var(--fgColor-default);
}

.main-layout .footnotes .data-footnote-backref g-emoji {
	font-family: monospace;
}

.main-layout body:has(:modal) {
	padding-right: var(--dialog-scrollgutter) !important;
}

.main-layout .pl-c {
	color: var(--color-prettylights-syntax-comment);
}

.main-layout .pl-c1,
.main-layout .pl-s .pl-v {
	color: var(--color-prettylights-syntax-constant);
}

.main-layout .pl-e,
.main-layout .pl-en {
	color: var(--color-prettylights-syntax-entity);
}

.main-layout .pl-smi,
.main-layout .pl-s .pl-s1 {
	color: var(--color-prettylights-syntax-storage-modifier-import);
}

.main-layout .pl-ent {
	color: var(--color-prettylights-syntax-entity-tag);
}

.main-layout .pl-k {
	color: var(--color-prettylights-syntax-keyword);
}

.main-layout .pl-s,
.main-layout .pl-pds,
.main-layout .pl-s .pl-pse .pl-s1,
.main-layout .pl-sr,
.main-layout .pl-sr .pl-cce,
.main-layout .pl-sr .pl-sre,
.main-layout .pl-sr .pl-sra {
	color: var(--color-prettylights-syntax-string);
}

.main-layout .pl-v,
.main-layout .pl-smw {
	color: var(--color-prettylights-syntax-variable);
}

.main-layout .pl-bu {
	color: var(--color-prettylights-syntax-brackethighlighter-unmatched);
}

.main-layout .pl-ii {
	color: var(--color-prettylights-syntax-invalid-illegal-text);
	background-color: var(--color-prettylights-syntax-invalid-illegal-bg);
}

.main-layout .pl-c2 {
	color: var(--color-prettylights-syntax-carriage-return-text);
	background-color: var(--color-prettylights-syntax-carriage-return-bg);
}

.main-layout .pl-sr .pl-cce {
	font-weight: bold;
	color: var(--color-prettylights-syntax-string-regexp);
}

.main-layout .pl-ml {
	color: var(--color-prettylights-syntax-markup-list);
}

.main-layout .pl-mh,
.main-layout .pl-mh .pl-en,
.main-layout .pl-ms {
	font-weight: bold;
	color: var(--color-prettylights-syntax-markup-heading);
}

.main-layout .pl-mi {
	font-style: italic;
	color: var(--color-prettylights-syntax-markup-italic);
}

.main-layout .pl-mb {
	font-weight: bold;
	color: var(--color-prettylights-syntax-markup-bold);
}

.main-layout .pl-md {
	color: var(--color-prettylights-syntax-markup-deleted-text);
	background-color: var(--color-prettylights-syntax-markup-deleted-bg);
}

.main-layout .pl-mi1 {
	color: var(--color-prettylights-syntax-markup-inserted-text);
	background-color: var(--color-prettylights-syntax-markup-inserted-bg);
}

.main-layout .pl-mc {
	color: var(--color-prettylights-syntax-markup-changed-text);
	background-color: var(--color-prettylights-syntax-markup-changed-bg);
}

.main-layout .pl-mi2 {
	color: var(--color-prettylights-syntax-markup-ignored-text);
	background-color: var(--color-prettylights-syntax-markup-ignored-bg);
}

.main-layout .pl-mdr {
	font-weight: bold;
	color: var(--color-prettylights-syntax-meta-diff-range);
}

.main-layout .pl-by {
	color: var(--color-prettylights-syntax-brackethighlighter-angle);
}

.main-layout .pl-sg {
	color: var(--color-prettylights-syntax-sublimelinter-gutter-mark);
}

.main-layout .pl-corl {
	text-decoration: underline;
	color: var(--color-prettylights-syntax-constant-other-reference-link);
}

.main-layout [role="button"]:focus:not(:focus-visible),
.main-layout [role="tabpanel"][tabindex="0"]:focus:not(:focus-visible),
.main-layout button:focus:not(:focus-visible),
.main-layout summary:focus:not(:focus-visible),
.main-layout a:focus:not(:focus-visible) {
	outline: none;
	box-shadow: none;
}

.main-layout [tabindex="0"]:focus:not(:focus-visible),
.main-layout details-dialog:focus:not(:focus-visible) {
	outline: none;
}

.main-layout g-emoji {
	display: inline-block;
	min-width: 1ch;
	font-family: "Apple Color Emoji", "Symbols Nerd Font", "Segoe UI Symbol";
	font-size: 1em;
	font-style: normal !important;
	font-weight: var(--base-text-weight-normal, 400);
	line-height: 1;
	vertical-align: -0.075em;
}

.main-layout g-emoji img {
	width: 1em;
	height: 1em;
}

.main-layout .task-list-item {
	list-style-type: none;
}

.main-layout .task-list-item label {
	font-weight: var(--base-text-weight-normal, 400);
}

.main-layout .task-list-item.enabled label {
	cursor: pointer;
}

.header-anchor {
	text-decoration: none !important;
	vertical-align: top;
	font-size: 0.7em;
	opacity: 0;
	transition: all 200ms ease;
}

h1:hover .header-anchor,
h2:hover .header-anchor,
h3:hover .header-anchor,
h4:hover .header-anchor,
h5:hover .header-anchor,
h6:hover .header-anchor {
	vertical-align: top;
	font-size: 1em;
	text-decoration: none !important;
	opacity: 0.5;
}

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

.copy-button.copied {
	border-color: #b5f700;
	transition: all 0.6s ease;
}

.copy-button.copied svg {
	stroke: #b5f700;
}

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

/* CALLOUTS W/ MARKDOWN-IT SYNTAX */
.tip,
.note,
.hint,
.warning,
.caution,
.important {
	margin-top: 1em;
	margin-left: 2em;
	margin-right: 2em;
	margin-bottom: 1em;
	border-left: 4px solid #d0d7de;
	border-radius: 7px;
	overflow: hidden;
	display: block;
	align-items: center;
	padding-top: 1em;
	padding-left: 0.5em;
	padding-right: 0.5em;
	padding-bottom: 0.1em;
}

.custom-block-title {
	position: relative;
	font-size: 0.9em;
	font-weight: 500;
	align-self: start;
	padding: 1em;
	color: #ddddddbb;
}

.tip>p,
.note>p,
.hint>p,
.warning>p,
.caution>p,
.important>p {
	/* padding: 0 16px 16px; */
	font-size: 0.95em;
	font-weight: 500;
	padding: 10px;
}

.note {
	border-left-color: #0969da;
	background: #456af010;
}

.tip {
	border-left-color: #1a7f37;
	background: #54f39c10;
}

.hint {
	border-left-color: #f6c02e;
	background: #8cd0dd86;
}

.important {
	border-left-color: #8250df;
	background: #6654f110;
}

.warning {
	border-left-color: #9a6700;
	background: #f5ae4410;
}

.caution {
	border-left-color: #cf222e;
	background: #ed386b10;
}

/* SELECTED TEXT STYLE */
::selection {
	background-color: #91919150;
}

::-moz-selection {
	background-color: #91919130;
}
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
var assets embed.FS

// bookSrcPath should ideally be configurable or determined dynamically,
// but for consistency with app.go, we define it here.
// Ensure this matches the one in app.go if GetMarkdownContent's baseDir is related.
const bookResourcePath = "book/LimpBook" // Path to your markdown book's root (where images, etc., are relative to)

func main() {
	app := NewApp()

	err := wails.Run(&options.App{
		Title:                    "devo",
		Width:                    1200,
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
			CSSDropProperty:    "--wails-drop",
			CSSDropValue:       "drop",
		},
		BackgroundColour: &options.RGBA{R: 0, G: 0, B: 0, A: 0},
		Windows: &windows.Options{
			WebviewIsTransparent: true,
			WindowIsTranslucent:  true,
			DisablePinchZoom:     true,
		},
		Mac: &mac.Options{
			TitleBar: &mac.TitleBar{
				TitlebarAppearsTransparent: true,
			},
			WebviewIsTransparent: true,
			WindowIsTranslucent:  false,
			About: &mac.AboutInfo{
				Title: "devo",
			},
		},
		AssetServer: &assetserver.Options{
			Assets: assets, // Serves the React frontend from embed.FS
			Middleware: func(next http.Handler) http.Handler {
				return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					path := r.URL.Path
					// Serve static assets (e.g., images) for markdown content
					// from the book's source directory.
					if strings.HasPrefix(path, "/bookassets/") {
						// log.Printf("Serving book asset: %s from %s", path, bookResourcePath) // For debugging
						// Strip /bookassets/ and serve from bookResourcePath
						http.StripPrefix("/bookassets/", http.FileServer(http.Dir(bookResourcePath))).ServeHTTP(w, r)
						return
					}
					// log.Printf("Serving frontend asset: %s", path) // For debugging
					next.ServeHTTP(w, r) // Let Wails serve the React app's assets
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


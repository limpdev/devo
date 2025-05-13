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

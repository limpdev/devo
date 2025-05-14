package main

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/menu"    // For creating menus
	"github.com/wailsapp/wails/v2/pkg/runtime" // For Wails runtime functions
)

// --- New methods for Context Menu ---

// OpenFileInEditor attempts to open the given file path in an external editor.
// For now, "zed.exe" is hardcoded.
func (a *App) OpenFileInEditor(filePath string) error {
	log.Printf("Attempting to open in editor: %s", filePath)

	// Check if file exists before trying to open
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		errMsg := fmt.Sprintf("file not found: %s", filePath)
		log.Printf("Cannot open in editor: %s", errMsg)
		// Optionally, notify frontend via Wails event
		runtime.EventsEmit(a.ctx, "editorError", fmt.Sprintf("File not found: %s", filepath.Base(filePath)))
		return fmt.Errorf(errMsg)
	}

	editorCmd := "zed.exe" // Hardcoded editor command

	cmd := exec.Command(editorCmd, filePath)
	err := cmd.Start() // Use Start to not block the Wails app.
	if err != nil {
		log.Printf("Failed to start editor '%s' for %s: %v", editorCmd, filePath, err)
		runtime.EventsEmit(a.ctx, "editorError", fmt.Sprintf("Failed to start editor for %s", filepath.Base(filePath)))
		return fmt.Errorf("failed to start editor '%s': %w", editorCmd, err)
	}
	log.Printf("Successfully launched editor '%s' for %s", editorCmd, filePath)
	return nil
}

// ShowTOCContextMenu displays a context menu for a given TOC item's file path.
func (a *App) ShowTOCContextMenu(relativePath string) {
	if a.ctx == nil {
		log.Println("Error: App context is nil in ShowTOCContextMenu. Startup might not have completed.")
		return
	}

	// Construct the absolute file path.
	// Uses bookSrcPath constant from bookParser.go (same package 'main')
	absBookSrcPath, err := filepath.Abs(bookSrcPath)
	if err != nil {
		log.Printf("Error getting absolute path for bookSrcPath '%s': %v", bookSrcPath, err)
		return
	}

	// Clean the relativePath to prevent it from escaping the intended directory
	cleanedRelativePath := filepath.Clean(filepath.Join("/", relativePath))
	if len(cleanedRelativePath) > 0 && cleanedRelativePath[0] == '/' {
		cleanedRelativePath = cleanedRelativePath[1:]
	}
	// Handle cases where relativePath might be empty, ".", or just a directory name after cleaning
	if cleanedRelativePath == "" || cleanedRelativePath == "." || !strings.HasSuffix(cleanedRelativePath, ".md") {
		log.Printf("Invalid or non-markdown relative path for context menu: '%s' (cleaned: '%s')", relativePath, cleanedRelativePath)
		return
	}

	absoluteFilePath := filepath.Join(absBookSrcPath, cleanedRelativePath)

	// Security check: Ensure the resolved targetPath is still within absBookSrcPath
	if !filepath.HasPrefix(absoluteFilePath, absBookSrcPath) {
		log.Printf("Security alert: Context menu attempt for file outside base directory: %s (resolved to %s)", relativePath, absoluteFilePath)
		return
	}

	fileName := filepath.Base(relativePath)

	contextMenu := menu.NewMenu()
	contextMenu.AddText(fmt.Sprintf("Open '%s' in Editor", fileName), nil, func(_ *menu.CallbackData) {
		err := a.OpenFileInEditor(absoluteFilePath)
		if err != nil {
			// Error is logged in OpenFileInEditor and an event is emitted.
			// We can also use runtime.LogError for Wails specific logging if desired.
			runtime.LogError(a.ctx, fmt.Sprintf("From context menu - Error opening '%s' in editor: %v", fileName, err))
		}
	})
	// Example of adding more items:
	// contextMenu.AddSeparator()
	// contextMenu.AddText("Item 2...", nil, func(_ *menu.CallbackData) {
	//	log.Printf("Context menu item 2 clicked for %s", relativePath)
	// })

	runtime.ContextMenu(a.ctx, contextMenu)
	log.Printf("Context menu shown for: %s (absolute path: %s)", relativePath, absoluteFilePath)
}

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

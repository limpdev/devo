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

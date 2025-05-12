# Ditching `iframes`

 Here is the basic setup for rendering with `unified`/`remark`...

```js
// Uses React as JSX
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeReact from 'rehype-react';
import { createElement } from 'react';

const processor = unified()
  .use(remarkParse)
  .use(remarkRehype)
  .use(rehypeReact, { createElement });

const MarkdownRenderer = ({ content }) => {
  return processor.processSync(content).result;
};
```

> [!TIP] 
> Hey dude, iframes are dogshit. Security is so shitty that even GitHub won't let you pull from their site. Also, performance is taking a hit!

##  Conversion...

   New build system will...

1.  **Parses `SUMMARY.md`**: To understand the book's structure and create a Table of Contents (TOC).
2.  **Loads Initial Content**: Displays the first chapter (or a specified one) when the app starts.
3.  **Enables Navigation**: Allows users to click TOC items to load different chapters.
4.  **Handles Assets**: Continues to serve images/CSS referenced in the Markdown.

Let's break this down:

**Backend Changes (Go)**

1.  **Data Structures for TOC and Book Data:**
    We need structs to represent TOC items and the overall book data that will be sent to the frontend.

    Create a new file, e.g., `book_types.go` (or add to `app.go`):
    ```go
    // book_types.go (or in app.go)
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

2.  **`SUMMARY.md` Parser:**
    This is the core of the new backend logic. We'll create a function to read and parse `book/src/SUMMARY.md`. This parser will be relatively simple and rely on the common `mdbook` `SUMMARY.md` format (markdown lists with links).

    Add this to `app.go` (or a new `book_parser.go`):
    ```go
    // app.go (or book_parser.go)
    package main

    import (
    	"bufio"
    	"context"
    	"fmt"
    	"io/ioutil"
    	"log"
    	"os"
    	"path/filepath"
    	"regexp"
    	"strings"
    )
    // ... (App struct, NewApp, startup, shutdown, Greet, GetMarkdownContent from previous steps)

    const bookSrcPath = "./book/src" // Define base path for book source

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
    	var parentStack []*[]TOCItem // Stack to manage current parent for nesting
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
    *   **Note:** This parser is simplified. Real `SUMMARY.md` files can have comments, titles (`# Summary`), parts (which are like top-level unlinked headers), and drafts. This parser focuses on list items with links. It assumes consistent indentation (e.g., 2 spaces).

3.  **New Go Method: `GetBookData`**
    This method will be called by the frontend to get the TOC and the initial chapter's content.

    Add to `app.go`:
    ```go
    // app.go

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
    *   The existing `GetMarkdownContent(relativePath string) (string, error)` function will be used to fetch individual chapter content when the user clicks on TOC items.
    *   Ensure `GetMarkdownContent`'s `baseDir` is `bookSrcPath` (e.g., `./book/src`).

4.  **Wails Bindings:**
    Run `wails dev` or `wails generate module` to make `GetBookData` available to the frontend.

**Frontend Changes (React - `App.jsx` and new components)**

1.  **New Component: `TableOfContents.jsx`**
    Create `frontend/src/components/TableOfContents.jsx`:
    ```jsx
    // frontend/src/components/TableOfContents.jsx
    import React from 'react';
    import './TableOfContents.css';

    const TOCItemLink = ({ item, onItemClick, currentPath, level }) => {
      const isCurrent = item.path && item.path === currentPath;
      const effectiveLevel = typeof level === 'number' ? level : item.level || 0;

      // Only make items with .md paths clickable for content loading.
      // Items with empty path might be section headers.
      const isClickable = item.path && item.path.toLowerCase().endsWith('.md');

      return (
        <li>
          {isClickable ? (
            <a
              href={`#${item.path}`} // Use hash for potential SPA routing, prevent full reload
              className={`toc-item-link ${isCurrent ? 'active' : ''}`}
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
            <span
              className="toc-item-header"
              style={{ paddingLeft: `${effectiveLevel * 15 + 10}px`, fontWeight: item.level === 0 ? 'bold' : 'normal' }}
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
        return <div className="toc-container"><p>Table of Contents is empty or could not be loaded.</p></div>;
      }

      return (
        <nav className="toc-container">
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
    Create `frontend/src/components/TableOfContents.css`:
    ```css
    /* frontend/src/components/TableOfContents.css */
    .toc-container {
      width: 280px; /* Adjust as needed */
      min-width: 200px;
      height: 100%; /* Fill the height of its flex container */
      overflow-y: auto;
      background-color: #26262a; /* Slightly different background */
      padding: 15px 0px; /* Add some top/bottom padding, no side for full-width feel of items */
      border-right: 1px solid #3a3a3e;
      color: #c5c5c5;
      box-sizing: border-box;
    }

    .toc-container ul {
      list-style: none;
      padding-left: 0;
      margin: 0;
    }

    .toc-container li {
      margin: 0; /* Remove default li margins */
    }

    .toc-item-link, .toc-item-header {
      display: block;
      padding: 8px 10px 8px 15px; /* Default padding, left padding adjusted by style prop */
      text-decoration: none;
      color: #c5c5c5;
      font-size: 0.9em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      border-left: 3px solid transparent; /* For active indicator */
      transition: background-color 0.2s ease, color 0.2s ease, border-left-color 0.2s ease;
    }

    .toc-item-link:hover {
      background-color: #333337;
      color: #fff;
    }

    .toc-item-link.active {
      background-color: #005ea525; /* Subtle active background */
      color: #61dafb; /* Brighter active text color */
      font-weight: 500;
      border-left-color: #61dafb; /* Active indicator line */
    }

    .toc-item-header {
      color: #a0a0a0; /* Dimmer color for non-linkable headers */
      font-weight: bold;
      cursor: default;
      padding-top: 10px;
      padding-bottom: 5px;
      /* margin-top: 5px; */
    }

    .toc-container ul ul {
      /* No specific style needed if padding is handled by item.level */
    }
    ```

2.  **Update `App.jsx`:**
    This will now manage the book state (TOC, current chapter) and orchestrate loading.
    ```jsx
    // frontend/src/App.jsx
    import { useState, useEffect, useCallback } from 'react';
    import * as runtime from '../wailsjs/runtime/runtime';
    import { Icon } from '@iconify/react';
    import ReactMarkdown from 'react-markdown';
    import remarkGfm from 'remark-gfm';
    import rehypeHighlight from 'rehype-highlight'; // If you use syntax highlighting
    // import 'highlight.js/styles/atom-one-dark.css'; // Example syntax highlighting theme

    // Import Go functions
    import { GetBookData, GetMarkdownContent } from '../wailsjs/go/main/App'; // GetBookData is new
    import { BrowserOpenURL } from '../wailsjs/runtime/runtime';

    import TableOfContents from './components/TableOfContents';
    import './App.css';
    // Optional: import 'github-markdown-css/github-markdown-dark.css'; // if using for content styling

    function App() {
      const [toc, setToc] = useState([]);
      const [currentMarkdown, setCurrentMarkdown] = useState('');
      const [currentPath, setCurrentPath] = useState(''); // Relative path of the current .md file
      const [isLoadingContent, setIsLoadingContent] = useState(true); // For content area
      const [initialLoadError, setInitialLoadError] = useState(null); // For errors during GetBookData

      // --- Window Controls ---
      const handleMinimize = () => runtime.WindowMinimise();
      const handleClose = () => runtime.Quit();

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
              setCurrentPath(bookData.initialPath || '');
            } else {
              setToc(bookData.toc);
              setCurrentMarkdown(bookData.initialMarkdown);
              setCurrentPath(bookData.initialPath);
            }
          } catch (err) {
            console.error('Critical error fetching book data:', err);
            const errorMsg = err.message || 'Failed to load book structure from backend.';
            setInitialLoadError(errorMsg);
            setCurrentMarkdown(`# Critical Error\n\n${errorMsg}`);
          } finally {
            setIsLoadingContent(false);
          }
        };
        fetchInitialBookData();
      }, []);

      const loadChapter = useCallback(async (relativePath) => {
        if (!relativePath || !relativePath.toLowerCase().endsWith('.md')) {
          console.warn("Attempted to load non-markdown file as chapter:", relativePath);
          return;
        }
        if (relativePath === currentPath && currentMarkdown) { // Avoid reloading same content
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
          const contentArea = document.querySelector('.content-view-wrapper');
          if (contentArea) contentArea.scrollTop = 0;
        } catch (err) {
          console.error(`Error fetching markdown for ${relativePath}:`, err);
          setCurrentMarkdown(`# Error loading content\n\nCould not load: \`${relativePath}\`\n\n${err.message}`);
          // Optionally set currentPath to an error state or keep previous
        } finally {
          setIsLoadingContent(false);
        }
      }, [currentPath, currentMarkdown]); // Add dependencies for useCallback

      // --- Markdown Components (Link and Image Handling) ---
      const markdownComponents = {
        a: ({ node, ...props }) => {
          const href = props.href;
          if (href && (href.toLowerCase().endsWith('.md') || (!href.startsWith('http') && !href.startsWith('#') && !href.startsWith('/')) ) ) {
            // Internal link to another .md file
            return (
              <a
                href={`#${href}`}
                onClick={(e) => {
                  e.preventDefault();
                  let targetPath = href;
                  // Basic relative path resolution from current chapter's directory
                  if (!href.startsWith('/') && currentPath && !href.toLowerCase().startsWith('http')) {
                      const currentDir = currentPath.substring(0, currentPath.lastIndexOf('/') + 1); // includes trailing slash
                      if (currentDir && !href.startsWith('../') && !href.startsWith('./')) {
                          targetPath = `${currentDir}${href}`;
                      } else { // More complex relative path (e.g. ../file.md or ./file.md)
                          const combinedPath = currentDir + href;
                          const parts = combinedPath.split('/');
                          const newParts = [];
                          for (const part of parts) {
                              if (part === '.' || part === '') continue;
                              if (part === '..') { if (newParts.length > 0) newParts.pop(); }
                              else newParts.push(part);
                          }
                          targetPath = newParts.join('/');
                      }
                  }
                  console.log(`Internal link clicked: ${href}, resolved to: ${targetPath}`);
                  loadChapter(targetPath);
                }}
                {...props}
              />
            );
          } else if (href && href.startsWith('#')) {
            // Anchor link within the same document
            return <a {...props} />;
          }
          // External link
          return (
            <a
              href={href}
              target="_blank" // Good practice for external links, though BrowserOpenURL handles it
              rel="noopener noreferrer"
              onClick={(e) => {
                e.preventDefault();
                BrowserOpenURL(href);
              }}
              {...props}
            />
          );
        },
        img: ({node, ...props}) => {
          let src = props.src;
          if (src && !src.startsWith('http') && !src.startsWith('/')) {
            // Relative image path e.g. "images/pic.png" or "../assets/diagram.png"
            // currentPath is like "folder/doc.md" or "doc.md"
            let base = '';
            const lastSlash = currentPath.lastIndexOf('/');
            if (lastSlash !== -1) {
              base = currentPath.substring(0, lastSlash); // "folder"
            }

            let newSrc = base ? `${base}/${src}` : src; // "folder/images/pic.png"
            const parts = newSrc.split('/');
            const resolved = [];
            for (const part of parts) {
              if (part === '.' || part === '') continue;
              if (part === '..') { if (resolved.length > 0) resolved.pop(); }
              else { resolved.push(part); }
            }
            // All assets from book/src are served under /bookcontent/ by AssetServer
            src = `/bookcontent/${resolved.join('/')}`;
          } else if (src && src.startsWith('/')) {
              // Path is absolute from web root e.g. /images/foo.png
              // Prepend /bookcontent to align with AssetServer serving from ./book/src
              src = `/bookcontent${src}`;
          }
          return <img {...props} src={src} alt={props.alt || ''} />;
        }
      };

      return (
        <div id="app-container">
          <div className="title-bar" style={{ '--wails-draggable': 'drag' }}>
            <div className="title-bar-text">  Devo MD Viewer </div>
            <div className="window-controls">
              <button onClick={handleMinimize} className="window-button minimize" aria-label="Minimize">
                <Icon icon="solar:minimize-square-3-line-duotone" width="11" height="11" style={{ color: '#ffffff40' }} />
              </button>
              <button onClick={handleClose} className="window-button close" aria-label="Close">
                <Icon icon="icon-park-twotone:close-one" width="11" height="11" style={{ color: '#ffffff40' }} />
              </button>
            </div>
          </div>

          <div className="main-layout">
            <TableOfContents
              tocItems={toc}
              onItemClick={loadChapter}
              currentPath={currentPath}
            />

            <div className="content-view-wrapper"> {/* Wrapper for scrolling */}
              {initialLoadError && (
                <div className="error-indicator global-error">
                  <h3>Failed to Load Book</h3>
                  <pre>{initialLoadError}</pre>
                </div>
              )}
              {isLoadingContent && (
                <div className="loading-indicator content-loading"> Loading Content...</div>
              )}
              {!isLoadingContent && currentMarkdown && (
                 // Add 'markdown-body' class if using github-markdown-css
                <div className="markdown-content">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeHighlight]} // Add if installed and theme imported
                    components={markdownComponents}
                  >
                    {currentMarkdown}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    export default App;
    ```

3.  **Update `App.css` for Layout:**
    ```css
    /* App.css */
    /* ... (keep existing #app-container, .title-bar, .window-controls from previous steps) ... */

    html, body, #root { /* Ensure #root also takes full height */
      height: 100%;
      margin: 0;
      overflow: hidden; /* Prevent body scrollbars if children manage their own */
    }

    #app-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      background-color: #1e1e1e;
      color: #ccc;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
        Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
    }

    .main-layout {
      display: flex;
      flex-grow: 1; /* Takes remaining height after title bar */
      height: calc(100% - 30px); /* Adjust 30px if title bar height changes */
      overflow: hidden; /* Children will manage their own scroll */
    }

    /* TableOfContents component will have its own width and scroll */

    .content-view-wrapper {
      flex-grow: 1;
      overflow-y: auto; /* This is where the content scrolls */
      padding: 25px 30px; /* Ample padding around content */
      background-color: #1e1e1e; /* Main content background */
      box-sizing: border-box;
    }

    .markdown-content { /* If you need a specific container for the ReactMarkdown output */
      /* For github-markdown-css, you might apply .markdown-body here or on a parent */
      max-width: 800px; /* Optional: constrain content width for readability */
      margin: 0 auto;   /* Center if max-width is used */
    }

    /* Styles for markdown elements if not using a pre-built theme like github-markdown-css */
    .markdown-content h1,
    .markdown-content h2,
    .markdown-content h3 {
      color: #e0e0e0;
      margin-top: 1.6em;
      margin-bottom: 0.6em;
      padding-bottom: 0.3em;
      border-bottom: 1px solid #444;
    }
    .markdown-content h1 { font-size: 2em; }
    .markdown-content h2 { font-size: 1.6em; }
    .markdown-content h3 { font-size: 1.3em; }

    .markdown-content p {
      line-height: 1.7;
      margin-bottom: 1em;
      color: #c5c5c5;
    }

    .markdown-content a {
      color: #61dafb;
      text-decoration: none;
    }
    .markdown-content a:hover {
      text-decoration: underline;
    }

    .markdown-content code {
      background-color: #2c2c30;
      padding: 0.2em 0.4em;
      margin: 0 0.1em;
      font-size: 85%;
      border-radius: 3px;
      color: #c8c8c8; /* Adjusted for better contrast */
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
    }

    .markdown-content pre {
      background-color: #2c2c30;
      padding: 1em;
      overflow-x: auto;
      border-radius: 5px;
      margin-bottom: 1.5em; /* More space after code blocks */
    }

    .markdown-content pre code {
      padding: 0;
      background-color: transparent;
      font-size: 0.9em; /* Slightly smaller for pre blocks */
      line-height: 1.45; /* Better line spacing in code blocks */
    }

    .markdown-content ul, .markdown-content ol {
      padding-left: 2em;
      margin-bottom: 1em;
    }
    .markdown-content li {
        margin-bottom: 0.4em;
    }

    .markdown-content blockquote {
      border-left: 4px solid #555;
      padding-left: 1em;
      margin-left: 0;
      color: #a0a0a0;
      font-style: italic;
    }

    .markdown-content img {
        max-width: 100%;
        height: auto;
        display: block; /* Prevents extra space below */
        margin: 1em auto; /* Center images with some margin */
        border-radius: 4px;
        /* box-shadow: 0 2px 8px rgba(0,0,0,0.3); */ /* Optional subtle shadow */
    }


    .loading-indicator.content-loading {
      text-align: center;
      padding: 50px;
      font-size: 1.2em;
      color: #aaa;
    }
    .error-indicator.global-error {
      padding: 20px;
      background-color: #4d2222;
      color: #ffdddd;
      border: 1px solid #803030;
      border-radius: 4px;
      margin: 20px;
    }
    .error-indicator pre {
        background-color: #00000030;
        padding: 10px;
        border-radius: 3px;
        white-space: pre-wrap;
        word-break: break-all;
    }
    ```

4.  **Asset Server (main.go):**
    Your `AssetServer` middleware in `main.go` should still be set up to serve assets from `./book/src` under a specific prefix, e.g., `/bookcontent/`. The `img` component override in `App.jsx` now uses this prefix.

    Make sure it looks something like this:
    ```go
    // main.go (AssetServer part)
    AssetServer: &assetserver.Options{
    	Assets: assets, // Serves the React frontend
    	Middleware: func(next http.Handler) http.Handler {
    		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
    			path := r.URL.Path
    			// Serve assets for markdown (e.g. images) from ./book/src/
    			// If markdown image is ![alt](/bookcontent/images/foo.png)
    			// this will serve ./book/src/images/foo.png
    			if strings.HasPrefix(path, "/bookcontent/") {
    				// log.Printf("Serving book asset: %s", path) // For debugging
    				http.StripPrefix("/bookcontent/", http.FileServer(http.Dir(bookSrcPath))).ServeHTTP(w, r)
    				return
    			}
    			// log.Printf("Serving frontend asset: %s", path) // For debugging
    			next.ServeHTTP(w, r) // Let Wails serve the React app
    		})
    	},
    },
    ```
    And define `bookSrcPath` in `main.go` as well if it's not already (or pass it around):
    ```go
    // main.go
    // ...
    const bookSrcPath = "./book/src" // Same as in app.go
    // ...
    ```

**Testing:**

1.  Create a `book/src/SUMMARY.md` file, for example:
    ```markdown
    # Summary

    - [Introduction](./README.md)
    - [Chapter 1: Getting Started](./chapter1/intro.md)
      - [Section 1.1](./chapter1/section1.1.md)
    - [Chapter 2: Advanced Concepts](./chapter2/advanced.md)
    - [Unlinked Section Header]() <!-- This will be styled as a header -->
      - [Another Page](./another.md)
    ```
2.  Create the corresponding `.md` files (`./book/src/README.md`, `./book/src/chapter1/intro.md`, etc.) with some sample content and image links (e.g., `![My Image](images/sample.png)`).
3.  Place an image at, for example, `./book/src/images/sample.png`.
4.  Run `wails dev`.

You should see the TOC on the left and the content of the first chapter on the right. Clicking TOC items should load the respective content. Image paths should be resolved correctly. Check browser console and Go logs for errors.

This is a significant step towards a full mdbook-like viewer! The `SUMMARY.md` parser and path resolutions can be made more robust over time.
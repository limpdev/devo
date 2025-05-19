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

package main

import (
	"embed"
	"log"
	"net/http" // Import the net/http package
	"strings"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver" // Import assetserver options
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

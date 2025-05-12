// frontend/src/App.jsx
import { useState, useEffect, useCallback } from 'react'
import * as runtime from '../wailsjs/runtime/runtime'
import { Icon } from '@iconify/react'
// Import markdown-it instead of remark
import MarkdownIt from 'markdown-it'
import markdownItAnchor from 'markdown-it-anchor'
import markdownItHighlight from 'markdown-it-highlightjs'
import hljs from 'highlight.js'

// Import Go functions
import { GetBookData, GetMarkdownContent } from '../wailsjs/go/main/App'
import { BrowserOpenURL } from '../wailsjs/runtime/runtime'

import TableOfContents from './components/TableOfContents'
import './App.css'

// Initialize markdown-it with plugins
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: true,
  langPrefix: 'language-',
  highlight: function (str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return (
          '<pre><code class="hljs">' +
          hljs.highlight(str, { language: lang, ignoreIllegals: true }).value +
          '</code></pre>'
        )
      } catch (__) {}
    }

    return (
      '<pre><code class="hljs">' + md.utils.escapeHtml(str) + '</code></pre>'
    )
  }
})
  .use(markdownItAnchor, {
    permalink: true,
    permalinkSymbol: '#',
    permalinkSpace: false
  })
  .use(markdownItHighlight)

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
      }
    },
    [currentPath, currentMarkdown]
  ) // Add dependencies for useCallback

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

  // Process HTML whenever it changes
  useEffect(() => {
    if (!currentHtml) return

    const processedHtml = processImages(currentHtml)
    // We're setting the HTML directly instead of using ReactMarkdown
    const contentEl = document.querySelector('.markdown-content')
    if (contentEl) {
      contentEl.innerHTML = processedHtml
    }
  }, [currentHtml, processImages])

  return (
    <div id='app-container'>
      <div className='title-bar' style={{ '--wails-draggable': 'drag' }}>
        <div className='title-bar-text'>  </div>
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
      </div>
    </div>
  )
}
export default App

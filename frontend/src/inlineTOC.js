// ADD PER-PAGE TOC (based on page headings)
document.addEventListener("DOMContentLoaded", function () {
  // --- Configuration ---
  const TOC_CONTAINER_ID = "toc-list";
  const TOC_SCROLL_CONTAINER_SELECTOR = ".toc-content"; // The element with overflow: auto/scroll
  const HEADER_SELECTOR = "h1, h2, h3, h4, h5, h6";
  const HIGHLIGHT_OFFSET_TOP = 100; // Pixels from viewport top to consider a heading "active"
  const SCROLL_THROTTLE_LIMIT = 100; // Milliseconds to throttle scroll updates

  // --- State ---
  let tocListElement = null;
  let tocScrollContainerElement = null;
  let headerElements = [];
  let tocItems = []; // Cache TOC li elements corresponding to headers
  let isThrottled = false;

  // --- Initialization ---
  function init() {
    tocListElement = document.getElementById(TOC_CONTAINER_ID);
    if (!tocListElement) {
      console.warn(`TOC container with ID "${TOC_CONTAINER_ID}" not found.`);
      return; // Stop if TOC list doesn't exist
    }

    tocScrollContainerElement = tocListElement.closest(
      TOC_SCROLL_CONTAINER_SELECTOR
    );
    if (!tocScrollContainerElement) {
      console.warn(
        `TOC scroll container matching selector "${TOC_SCROLL_CONTAINER_SELECTOR}" not found. TOC scrolling might not work.`
      );
      // We can still proceed without TOC scrolling, so don't return here.
      // tocScrollContainerElement will remain null, and checks later will handle it.
    }

    generateTOC();

    // Only add scroll listener if TOC was successfully generated
    if (headerElements.length > 0) {
      window.addEventListener("scroll", handleScroll);
      // Initial highlight check
      highlightCurrentSection();
    }
  }

  // --- TOC Generation ---
  function generateTOC() {
    const headers = document.querySelectorAll(HEADER_SELECTOR);
    let headerIndex = 0; // Use a separate counter for unique IDs

    headers.forEach((header) => {
      // Ensure headers are part of the main content, not inside the TOC itself etc.
      // You might need a more specific selector for your main content area
      // if (header.closest('#main-content')) { // Example check

      // Ensure headers have IDs or generate one
      if (!header.id) {
        header.id = `toc-section-${headerIndex}`;
      }
      headerIndex++;

      // Create TOC item
      const listItem = document.createElement("li");
      listItem.textContent = header.textContent.trim();
      listItem.classList.add(`toc-${header.tagName.toLowerCase()}`);
      listItem.setAttribute("data-target", header.id);

      // Add click event to scroll to section
      listItem.addEventListener("click", (e) => {
        e.preventDefault(); // Prevent potential hash changes if wrapped in <a>
        const targetElement = document.getElementById(header.id);
        if (targetElement) {
          targetElement.scrollIntoView({
            behavior: "smooth",
            block: "start", // Scrolls so the header is at the top
          });
          // Optional: If you use hash URLs, update manually after scroll
          // window.history.pushState(null, null, `#${header.id}`);
        }
      });

      tocListElement.appendChild(listItem);

      // Store references for highlighting
      headerElements.push(header);
      tocItems.push(listItem);

      // } // End of example check for main content
    });
  }

  // --- Scroll Handling & Highlighting ---
  function handleScroll() {
    if (!isThrottled) {
      window.requestAnimationFrame(() => {
        highlightCurrentSection();
        isThrottled = false;
      });
      isThrottled = true;
      // Fallback throttle if requestAnimationFrame isn't enough (e.g., intensive calculations)
      // setTimeout(() => { isThrottled = false; }, SCROLL_THROTTLE_LIMIT);
    }
  }

  function highlightCurrentSection() {
    if (!tocListElement || headerElements.length === 0) return;

    let currentSectionId = null;

    // Find the last header that is above the highlight offset
    // Iterate backwards for efficiency (often find the match sooner)
    for (let i = headerElements.length - 1; i >= 0; i--) {
      const header = headerElements[i];
      const rect = header.getBoundingClientRect();

      if (rect.top < HIGHLIGHT_OFFSET_TOP) {
        currentSectionId = header.id;
        break; // Found the current section
      }
    }

    // If scrolled to the very top, or no header is above the offset,
    // highlight the first item if it exists.
    if (currentSectionId === null && headerElements.length > 0) {
      // Check if the first header is reasonably visible, otherwise highlight nothing
      const firstHeaderRect = headerElements[0].getBoundingClientRect();
      if (
        firstHeaderRect.bottom > 0 &&
        firstHeaderRect.top < window.innerHeight
      ) {
        currentSectionId = headerElements[0].id;
      }
    }

    // Update active class on TOC items
    let activeItemFound = false;
    tocItems.forEach((item) => {
      const targetId = item.getAttribute("data-target");
      if (targetId === currentSectionId) {
        item.classList.add("toc-active");
        activeItemFound = true;
        // Scroll the active item into view within the TOC container
        if (
          tocScrollContainerElement &&
          typeof item.scrollIntoView === "function"
        ) {
          // Check if element is already visible within the container
          const containerRect =
            tocScrollContainerElement.getBoundingClientRect();
          const itemRect = item.getBoundingClientRect();

          if (
            itemRect.top < containerRect.top ||
            itemRect.bottom > containerRect.bottom
          ) {
            // Only scroll if needed. 'nearest' prevents scrolling if already visible.
            item.scrollIntoView({ block: "nearest", behavior: "auto" }); // Use 'auto' for immediate jump during scroll, 'smooth' can feel weird here
          }
        }
      } else {
        item.classList.remove("toc-active");
      }
    });

    // Fallback: If somehow no specific section is active (e.g., scrolled way past the last section),
    // maybe remove all active classes (already done) or highlight the last item?
    // Current logic handles highlighting the first item at the top.
    // If scrolled way below the last item, no item might be highlighted, which is often acceptable.
  }

  // --- Utility: Throttle ---
  // Basic throttle function (can be replaced with lodash/underscore throttle if available)
  // Note: Using requestAnimationFrame in handleScroll provides efficient throttling for rendering updates.
  // A time-based throttle is more about limiting function execution frequency over time.
  // We'll primarily rely on rAF here.

  // --- Start Execution ---
  init();
});
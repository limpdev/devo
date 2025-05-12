/* HERE ARE MY ADDITIONS */
/**
 * Converts GitHub-style markdown callouts to HTML callouts within existing HTML blockquotes
 */
function convertMarkdownCalloutsToHtml(htmlText) {
  // Define callout types and their icons
  const calloutTypes = {
    NOTE: '<i class="note-icon">󱞁</i>',
    TIP: '<i class="tip-icon">󰴓</i>',
    IMPORTANT: '<i class="important-icon">󱁯</i>',
    WARNING: '<i class="warning-icon">󰉀</i>',
    CAUTION: '<i class="caution-icon"></i>',
  };

  // Regex to match GitHub-style callouts inside blockquotes in HTML
  // Matches: <blockquote><p>[!TYPE] ... </p></blockquote>
  const calloutRegex =
    /<blockquote>\s*<p>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*([\s\S]*?)<\/p>\s*<\/blockquote>/gm;

  return htmlText.replace(calloutRegex, function (match, type, content) {
    // Normalize the type to handle case variations
    const normalizedType = type.toUpperCase();

    // Make sure we have a valid type, or default to NOTE
    const calloutType = Object.keys(calloutTypes).includes(normalizedType)
      ? normalizedType
      : "NOTE";

    // Process the content - trim whitespace
    const processedContent = content.trim();

    // Build the HTML replacement
    return `<div class="callout callout-${calloutType.toLowerCase()}">
  <div class="callout-header">
    <span class="callout-icon">${calloutTypes[calloutType]}</span>
    <span class="callout-title">${calloutType}</span>
  </div>
  <div class="callout-content">
    <p>${processedContent}</p>
  </div>
</div>`;
  });
}

document.addEventListener("DOMContentLoaded", function () {
  // Get the current HTML content of the body
  let bodyHTML = document.body.innerHTML;

  // Convert the markdown callouts in the HTML to proper callout divs
  bodyHTML = convertMarkdownCalloutsToHtml(bodyHTML);

  // Replace the body's HTML with the converted content
  document.body.innerHTML = bodyHTML;
});

// Add click listener to codeblock copy buttons + an SVG transformation
document.querySelectorAll(".clip-button").forEach((button) => {
  button.addEventListener("click", () => {
    try {
      // Get the SVG element
      const svg = button.querySelector("svg");

      // Save original attributes
      const originalViewBox = svg.getAttribute("viewBox");
      const originalWidth = svg.getAttribute("width");
      const originalHeight = svg.getAttribute("height");

      // Clear the SVG content and update attributes
      svg.innerHTML = "";
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("width", "1.5em");
      svg.setAttribute("height", "1.5em");
      svg.setAttribute("fill", "green");

      // Create a new success path
      const successPath = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path"
      );
      successPath.setAttribute(
        "d",
        "M10 2a3 3 0 0 0-2.83 2H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3h-1.17A3 3 0 0 0 14 2zM9 5a1 1 0 0 1 1-1h4a1 1 0 1 1 0 2h-4a1 1 0 0 1-1-1m6.78 6.625a1 1 0 1 0-1.56-1.25l-3.303 4.128l-1.21-1.21a1 1 0 0 0-1.414 1.414l2 2a1 1 0 0 0 1.488-.082l4-5z"
      );
      svg.appendChild(successPath);

      // Update the aria label
      button.setAttribute("aria-label", "Copied!");

      // Reset to original after 2 seconds
      setTimeout(() => {
        // Clear the SVG
        svg.innerHTML = "";

        // Restore original attributes
        svg.setAttribute("viewBox", originalViewBox);
        svg.setAttribute("width", originalWidth);
        svg.setAttribute("height", originalHeight);
        svg.removeAttribute("fill");

        // Create and add the original path back
        const originalPath = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "path"
        );
        originalPath.setAttribute("id", "clipSVG");
        originalPath.setAttribute(
          "d",
          "m 19.658,22.84 5.75,-5.75 -5.75,-5.75 1.75,-1.7499999 7.5,7.4999999 -7.5,7.5 z m -3.316,0 -5.75,-5.75 5.75,-5.75 -1.75,-1.7499999 -7.5,7.4999999 7.5,7.5 z"
        );
        svg.appendChild(originalPath);

        // Reset the aria label
        button.setAttribute("aria-label", "Copy to clipboard");
      }, 2000);
    } catch (err) {
      console.error("Could NOT achieve transformation, see ", err);
    }
  });
});

// Add ripple effect for every mouse click, anywhere on the page using an SVG
document.addEventListener("click", function (e) {
  // Create a container for the ripple effect
  const rippleContainer = document.createElement("div");
  rippleContainer.style.position = "fixed";
  rippleContainer.style.left = e.clientX - 48 + "px"; // Center the ripple at click position
  rippleContainer.style.top = e.clientY - 48 + "px";
  rippleContainer.style.pointerEvents = "none"; // Don't interfere with further clicks
  rippleContainer.style.zIndex = "9999";

  // Create SVG element
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("width", "96");
  svg.setAttribute("height", "96");
  svg.setAttribute("viewBox", "0 0 24 24");

  // Create circle element
  const circle = document.createElementNS(svgNS, "circle");
  circle.setAttribute("cx", "12");
  circle.setAttribute("cy", "12");
  circle.setAttribute("r", "0");
  circle.setAttribute("fill", "rgba(168, 168, 168, 0.7)");

  // Create animate elements
  const animateRadius = document.createElementNS(svgNS, "animate");
  animateRadius.setAttribute("attributeName", "r");
  animateRadius.setAttribute("calcMode", "spline");
  animateRadius.setAttribute("dur", "0.5s");
  animateRadius.setAttribute("keySplines", ".52,.6,.25,.99");
  animateRadius.setAttribute("values", "0;11");
  animateRadius.setAttribute("fill", "freeze");

  const animateOpacity = document.createElementNS(svgNS, "animate");
  animateOpacity.setAttribute("attributeName", "opacity");
  animateOpacity.setAttribute("calcMode", "spline");
  animateOpacity.setAttribute("dur", "0.33s");
  animateOpacity.setAttribute("keySplines", ".52,.6,.25,.99");
  animateOpacity.setAttribute("values", "1;0");
  animateOpacity.setAttribute("fill", "freeze");

  // Assemble the SVG
  circle.appendChild(animateRadius);
  circle.appendChild(animateOpacity);
  svg.appendChild(circle);
  rippleContainer.appendChild(svg);

  // Add to document
  document.body.appendChild(rippleContainer);

  // Remove after animation completes
  setTimeout(() => {
    document.body.removeChild(rippleContainer);
  }, 1500); // Match the duration of the animation
});

// MARK TAGS FOR TEXT - AKA, Highlighting!
function addMarkTags(text) {
  // Replace text wrapped between == and == with <mark> tags
  // This regex finds any text between =: and := regardless of its location
  const markRegex = /==(.*?)==/g;
  const markReplace = (match, content) => {
    return `<mark>${content}</mark>`;
  };
  return text.replace(markRegex, markReplace);
}

document.addEventListener("DOMContentLoaded", function () {
  // Get the current HTML content of the body
  let bodyHTML = document.body.innerHTML;
  // First apply the mark tags (highlighting)
  bodyHTML = addMarkTags(bodyHTML);
  // Then convert the markdown callouts
  bodyHTML = convertMarkdownCalloutsToHtml(bodyHTML);
  // Replace the body's HTML with the converted content
  document.body.innerHTML = bodyHTML;
});

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

import React from "react";
import "./TableOfContents.css";
// Import the new Go function that will be bound by Wails
import { ShowTOCContextMenu } from "../../wailsjs/go/main/App";

const TOCItemLink = ({ item, onItemClick, currentPath, level }) => {
	const isCurrent = item.path && item.path === currentPath;
	const effectiveLevel = typeof level === "number" ? level : item.level || 0;

	// Only make items with .md paths clickable for content loading AND context menu.
	const isClickable = item.path && item.path.toLowerCase().endsWith(".md");

	const handleContextMenu = (event) => {
		// Ensure this is a clickable item with a valid path before showing context menu
		if (isClickable && item.path) {
			event.preventDefault(); // Prevent default browser context menu
			ShowTOCContextMenu(item.path); // Call the Go function
		}
		// If not clickable, or no path, the default browser context menu might appear or nothing.
		// We could explicitly allow default for non-clickable if needed:
		// else { event.stopPropagation(); /* or do nothing to allow default */ }
	};

	return (
		<li>
			{isClickable ? (
				<a
					href={`#${item.path}`} // Use hash for potential SPA routing, prevent full reload
					className={`toc-item-link ${isCurrent ? "active" : ""}`}
					onClick={(e) => {
						e.preventDefault();
						onItemClick(item.path);
					}}
					onContextMenu={handleContextMenu} // Attach the context menu handler here
					style={{ paddingLeft: `${effectiveLevel * 15 + 10}px` }} // Indentation
					title={item.path}
				>
					{item.title}
				</a>
			) : (
				<span
					className="toc-item-header"
					style={{ paddingLeft: `${effectiveLevel * 15 + 10}px`, fontWeight: item.level === 0 ? "bold" : "normal" }}
					// No onContextMenu for non-clickable headers by default
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
		return (
			<div className="toc-container hide-scrollbar scrollbar-none">
				<p>Table of Contents is empty or could not be loaded.</p>
			</div>
		);
	}

	return (
		<nav className="toc-container hide-scrollbar scrollbar-none">
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

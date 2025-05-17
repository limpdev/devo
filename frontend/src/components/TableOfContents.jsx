// frontend/src/components/TableOfContents.jsx
import React, { useState } from "react"; // Import useState
import "./TableOfContents.css";
// Import the new Go function that will be bound by Wails
// import { ShowTOCContextMenu } from "../../wailsjs/go/main/App";

const TOCItemLink = ({ item, onItemClick, currentPath, level }) => {
	const isCurrent = item.path && item.path === currentPath;
	const effectiveLevel = typeof level === "number" ? level : item.level || 0;
	const hasChildren = item.children && item.children.length > 0;

	// State for collapsed/expanded status of this item's children
	// Default to collapsed (true). Set to false if you want them expanded by default.
	const [isCollapsed, setIsCollapsed] = useState(true);

	// Only make items with .md paths clickable for content loading AND context menu.
	const isClickable = item.path && item.path.toLowerCase().endsWith(".md");

	// const handleContextMenu = (event) => {
	// 	if (isClickable && item.path) {
	// 		event.preventDefault(); // Prevent default browser context menu
	// 		ShowTOCContextMenu(item.path); // Call the Go function
	// 	}
	// };

	const handleToggleCollapse = (e) => {
		// Prevent the click from propagating to the link if the toggle is part of the link area
		e.stopPropagation();
		setIsCollapsed(!isCollapsed);
	};

	// Style for the entire row (toggle + link/header) to handle indentation
	const itemRowStyle = { paddingLeft: `${effectiveLevel * 15 + 10}px` };

	return (
		<li>
			<div className="toc-item-row" style={itemRowStyle}>
				{hasChildren ? (
					<button onClick={handleToggleCollapse} className="toc-toggle-button" aria-expanded={!isCollapsed} title={isCollapsed ? "Expand" : "Collapse"}>
						{isCollapsed ? "" : ""}
					</button>
				) : (
					<span className="toc-toggle-placeholder"></span> /* For alignment */
				)}

				{isClickable ? (
					<a
						href={`#${item.path}`}
						className={`toc-item-link ${isCurrent ? "active" : ""}`}
						onClick={(e) => {
							e.preventDefault();
							onItemClick(item.path);
						}}
						// onContextMenu={handleContextMenu}
						title={item.path}
					>
						{item.title}
					</a>
				) : (
					<span
						className="toc-item-header"
						// If non-clickable headers can also be parents, allow toggling them
						onClick={hasChildren ? handleToggleCollapse : undefined}
						style={{ cursor: hasChildren ? "pointer" : "default", fontWeight: item.level === 0 ? "bold" : "normal" }}
					>
						{item.title}
					</span>
				)}
			</div>

			{hasChildren &&
				!isCollapsed && ( // Conditionally render children
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

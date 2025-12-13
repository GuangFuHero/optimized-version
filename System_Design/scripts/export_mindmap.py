#!/usr/bin/env python3
"""
Export mindmap from Markdown files to various formats.

Outputs:
- HTML: Interactive mindmap via Markmap (pure Python, no npm needed!)
- PDF: Full spec document via weasyprint

Dependencies:
- weasyprint (for PDF): uv add weasyprint markdown
"""

import html
import json
import re
from pathlib import Path
from datetime import datetime


# Project paths
PROJECT_ROOT = Path(__file__).parent.parent
MINDMAP_DIR = PROJECT_ROOT / "mindmap"  # Changed from docs to mindmap
OUTPUT_DIR = PROJECT_ROOT / "exports"


def ensure_output_dir():
    """Create exports directory if it doesn't exist."""
    OUTPUT_DIR.mkdir(exist_ok=True)


def collect_modules():
    """Collect all module directories from mindmap/."""
    if not MINDMAP_DIR.exists():
        print(f"ERROR: {MINDMAP_DIR} does not exist.")
        return []

    modules = []
    for item in sorted(MINDMAP_DIR.iterdir()):
        if item.is_dir() and item.name.startswith(('01_', '02_', '03_', '04_', '05_', '06_')):
            module = {
                "name": item.name,
                "path": item,
            }
            modules.append(module)
    return modules


# NOTE: extract_fr_items() and extract_dimensions() removed -
# no longer needed since we traverse directory tree instead of parsing headings


def generate_markmap_md(modules) -> str:
    """Generate hierarchical markdown for Markmap by traversing directory tree.

    Directory structure maps to markdown hierarchy:
    - mindmap/01_map/content.md → ## 地圖站點
    - mindmap/01_map/requirements/content.md → ### 功能需求
    - mindmap/01_map/requirements/ui_ux/content.md → #### UI/UX
    - mindmap/01_map/requirements/backend/specs/content.md → ##### SPEC 連結
    """
    lines = []
    lines.append("# 光復超人 2.0")
    lines.append("")

    # Module display names mapping (NN_ prefix)
    module_names = {
        "01_map": "地圖站點",
        "02_volunteer_tasks": "志工任務",
        "03_delivery": "配送模組",
        "04_info_page": "資訊頁面",
        "05_moderator_admin": "審核後台",
        "06_system_admin": "系統管理"
    }

    # Directory name → Heading name mapping
    dir_to_heading = {
        "requirements": "功能需求",
        "ui_ux": "UI/UX",
        "frontend": "Frontend",
        "backend": "Backend",
        "ai_data": "AI & Data",
        "specs": "SPEC 連結"
    }

    def walk_directory(path: Path, level: int):
        """Recursively walk directory and generate markdown."""
        nonlocal lines

        # Get directory name
        dir_name = path.name

        # Determine heading level (## for modules, ### for requirements, etc.)
        heading_prefix = "#" * level

        # Get display name
        if level == 2:  # Module level
            display_name = module_names.get(dir_name, dir_name)
        else:
            display_name = dir_to_heading.get(dir_name, dir_name)

        # Read content.md if exists
        content_file = path / "content.md"
        content_lines = []
        if content_file.exists():
            content = content_file.read_text().strip()
            if content:
                for line in content.split('\n'):
                    if line.strip():
                        content_lines.append(line.strip())

        # Use <br> to merge content into heading for ALL levels
        # This creates a multi-line text block like Whimsical
        if content_lines:
            # Heading with content as <br> separated text block
            heading_with_content = display_name + "<br>" + "<br>".join(content_lines)
            lines.append(f"{heading_prefix} {heading_with_content}")
            lines.append("")
        else:
            # Add heading without content
            lines.append(f"{heading_prefix} {display_name}")
            lines.append("")

        # Process subdirectories (sorted by name)
        subdirs = sorted([d for d in path.iterdir() if d.is_dir()])
        for subdir in subdirs:
            walk_directory(subdir, level + 1)

    # Process each module
    for module in modules:
        walk_directory(module["path"], level=2)  # Start at ## (module level)

    return '\n'.join(lines)


# NOTE: _collect_specs_by_module() removed - SPECs now live in
# mindmap/.../backend/specs/content.md and are traversed automatically


def escape_but_preserve_br(text: str) -> str:
    """Escape HTML but preserve <br> tags for multiline nodes."""
    escaped = html.escape(text)
    # Restore <br> tags that were escaped
    return escaped.replace("&lt;br&gt;", "<br>")


def markdown_to_tree(md_content: str) -> dict:
    """
    Parse markdown headings into a tree structure for Markmap.

    Returns a tree like:
    {
        "content": "Root Title",
        "children": [
            {"content": "Child 1", "children": [...]},
            ...
        ]
    }
    """
    lines = md_content.strip().split('\n')

    # Root node
    root = {"content": "", "children": []}

    # Stack to track hierarchy: [(level, node), ...]
    stack = [(0, root)]

    for line in lines:
        # Match heading lines
        heading_match = re.match(r'^(#{1,6})\s+(.+)$', line)
        if heading_match:
            level = len(heading_match.group(1))
            content = heading_match.group(2).strip()

            # Use escape_but_preserve_br to allow <br> for multiline nodes
            new_node = {"content": escape_but_preserve_br(content), "children": []}

            # Pop stack until we find a parent with lower level
            while stack and stack[-1][0] >= level:
                stack.pop()

            # Add to parent's children
            if stack:
                stack[-1][1]["children"].append(new_node)

            # Push current node
            stack.append((level, new_node))

        # Match list items (attach to current heading)
        elif line.strip().startswith('- '):
            content = line.strip()[2:].strip()
            if content and stack:
                leaf = {"content": escape_but_preserve_br(content), "children": []}
                stack[-1][1]["children"].append(leaf)

    # Return the first actual heading as root (skip the dummy root)
    if root["children"]:
        return root["children"][0]
    return root


def generate_markmap_html(tree: dict, theme: str = "auto") -> str:
    """
    Generate a self-contained HTML file with Markmap visualization.
    Uses CDN for libraries (needs internet when viewing, but not when generating).

    Args:
        tree: The mindmap tree structure
        theme: "auto" (follows system), "dark", or "light"
    """
    tree_json = json.dumps(tree, ensure_ascii=False)

    # Theme-specific logic
    if theme == "dark":
        theme_class = "markmap-dark"
        theme_script = 'document.documentElement.classList.add("markmap-dark");'
    elif theme == "light":
        theme_class = ""
        theme_script = '// Light theme - no dark class'
    else:  # auto
        theme_class = ""
        theme_script = '''if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
  document.documentElement.classList.add("markmap-dark");
}'''

    html_template = f'''<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>光復超人 2.0 - Mindmap</title>
<style>
* {{
  margin: 0;
  padding: 0;
}}
html {{
  font-family: ui-sans-serif, system-ui, sans-serif, 'Apple Color Emoji',
    'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji';
}}
#mindmap {{
  display: block;
  width: 100vw;
  height: 100vh;
}}
.markmap-dark {{
  background: #27272a;
  color: white;
}}
</style>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/markmap-toolbar@0.18.12/dist/style.css">
</head>
<body>
<svg id="mindmap"></svg>
<script src="https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/markmap-view@0.18.12/dist/browser/index.js"></script>
<script src="https://cdn.jsdelivr.net/npm/markmap-toolbar@0.18.12/dist/index.js"></script>
<script>
// Tree data generated by Python
const root = {tree_json};

// Initialize markmap
const {{ Markmap, deriveOptions }} = window.markmap;
const mm = Markmap.create("svg#mindmap", deriveOptions(null), root);
window.mm = mm;

// Add toolbar
const toolbar = new markmap.Toolbar();
toolbar.attach(mm);
const el = toolbar.render();
el.setAttribute("style", "position:absolute;bottom:20px;right:20px");
document.body.append(el);

// Theme
{theme_script}
</script>
</body>
</html>'''

    return html_template


def export_markmap(modules):
    """Export mindmap as interactive HTML using pure Python (no npm needed!)."""
    print("Generating Markmap mindmap...")

    # Generate hierarchical markdown
    md_content = generate_markmap_md(modules)

    # Write intermediate markdown file
    md_file = OUTPUT_DIR / "mindmap_source.md"
    with open(md_file, 'w') as f:
        f.write(md_content)
    print(f"  Created: {md_file}")

    # Parse markdown to tree
    tree = markdown_to_tree(md_content)

    # Generate HTML for light and dark themes
    themes = [
        ("mindmap.html", "light"),       # Light theme (default)
        ("mindmap_dark.html", "dark"),   # Dark theme
    ]

    for filename, theme in themes:
        html_content = generate_markmap_html(tree, theme=theme)
        html_file = OUTPUT_DIR / filename
        with open(html_file, 'w') as f:
            f.write(html_content)
        print(f"  Created: {html_file} ({theme})")

    return OUTPUT_DIR / "mindmap.html"


def collect_markdown_content(modules):
    """Collect all markdown content from mindmap/ tree into a single document."""
    content = []

    # Title page
    content.append("# 光復超人 2.0 - 系統設計文件")
    content.append("")
    content.append(f"*Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}*")
    content.append("")
    content.append("---")
    content.append("")

    # Read main README if exists
    readme = PROJECT_ROOT / "README.md"
    if readme.exists():
        content.append(readme.read_text())
        content.append("")
        content.append("---")
        content.append("")

    def walk_and_collect(path: Path, depth: int = 0):
        """Recursively collect all content.md files."""
        nonlocal content

        # Read content.md if exists
        content_file = path / "content.md"
        if content_file.exists():
            md_content = content_file.read_text().strip()
            if md_content:
                # Add heading based on directory name
                heading_level = "#" * min(depth + 1, 6)  # Max h6
                dir_name = path.name
                content.append(f"{heading_level} {dir_name}")
                content.append("")
                content.append(md_content)
                content.append("")
                content.append("---")
                content.append("")

        # Process subdirectories
        for subdir in sorted([d for d in path.iterdir() if d.is_dir()]):
            walk_and_collect(subdir, depth + 1)

    # Walk each module
    for module in modules:
        walk_and_collect(module["path"], depth=1)

    return '\n'.join(content)


def export_pdf(modules):
    """Export all docs as PDF using weasyprint."""
    print("Generating PDF document...")

    try:
        import markdown
        from weasyprint import HTML
    except (ImportError, OSError) as e:
        print("  SKIPPED: weasyprint not available (missing native libraries)")
        print(f"  Hint: brew install pango")
        return None

    md_content = collect_markdown_content(modules)
    html_content = markdown.markdown(md_content, extensions=['tables', 'fenced_code'])

    # Add basic CSS
    html_with_style = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: Arial, sans-serif; margin: 40px; }}
            h1 {{ color: #333; border-bottom: 2px solid #4ECDC4; }}
            h2 {{ color: #555; }}
            table {{ border-collapse: collapse; width: 100%; margin: 20px 0; }}
            th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
            th {{ background-color: #4ECDC4; color: white; }}
            code {{ background-color: #f4f4f4; padding: 2px 5px; }}
            pre {{ background-color: #f4f4f4; padding: 10px; overflow-x: auto; }}
            hr {{ border: none; border-top: 1px solid #ddd; margin: 30px 0; }}
        </style>
    </head>
    <body>
        {html_content}
    </body>
    </html>
    """

    pdf_file = OUTPUT_DIR / "mindmap_spec.pdf"

    try:
        HTML(string=html_with_style).write_pdf(str(pdf_file))
        print(f"  Created: {pdf_file}")
        return pdf_file
    except Exception as e:
        print(f"  ERROR: {e}")
        return None


def main():
    print("=" * 50)
    print("Mindmap Export Tool (Pure Python Edition)")
    print("=" * 50)
    print()

    ensure_output_dir()
    modules = collect_modules()

    print(f"Found {len(modules)} modules:")
    for m in modules:
        print(f"  - {m['name']}")
    print()

    # Export Markmap HTML (no npm needed!)
    export_markmap(modules)

    # Export PDF
    export_pdf(modules)

    print()
    print("Done! Check the 'exports/' directory.")
    print()
    print("Tips:")
    print("  - Open mindmap.html in browser for interactive mindmap")
    print("  - mindmap_source.md is the generated markdown (can edit manually)")


if __name__ == "__main__":
    main()

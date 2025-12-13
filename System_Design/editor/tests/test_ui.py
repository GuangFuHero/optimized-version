"""
Playwright UI tests for Mindmap Editor

Run with:
    cd editor && uv run pytest tests/test_ui.py -v --headed

Or headless (faster, for CI):
    cd editor && uv run pytest tests/test_ui.py -v

Screenshots are saved to: editor/tests/screenshots/
"""

import re
import pytest
from pathlib import Path
from playwright.sync_api import Page, expect

# Test configuration
BASE_URL = "http://localhost:3000"
SCREENSHOT_DIR = Path(__file__).parent / "screenshots"


@pytest.fixture(scope="module", autouse=True)
def setup_screenshots():
    """Create screenshots directory if it doesn't exist"""
    SCREENSHOT_DIR.mkdir(exist_ok=True)


@pytest.fixture
def page(page: Page):
    """Navigate to the app before each test"""
    # Clear localStorage to ensure clean state
    page.goto(BASE_URL)
    page.evaluate("localStorage.clear()")
    page.goto(f"{BASE_URL}?nocache={id(page)}")
    # Wait for WebSocket connection
    page.wait_for_selector(".status.connected", timeout=5000)
    return page


class TestThemeToggle:
    """Tests for theme toggle functionality"""

    def test_default_is_dark_theme(self, page: Page):
        """App should start in dark theme by default"""
        # Check body does NOT have light-theme class
        body = page.locator("body")
        expect(body).not_to_have_class(re.compile(r"\blight-theme\b"))

        # Verify dark background color
        bg_color = page.evaluate("window.getComputedStyle(document.body).backgroundColor")
        assert bg_color == "rgb(26, 26, 46)", f"Expected dark bg, got {bg_color}"

        page.screenshot(path=SCREENSHOT_DIR / "01_dark_theme_default.png")

    def test_toggle_to_light_theme(self, page: Page):
        """Clicking theme toggle should switch to light theme"""
        # Click theme toggle button (in header)
        page.click("#btn-theme-toggle")

        # Check body has light-theme class
        body = page.locator("body")
        expect(body).to_have_class(re.compile(r"\blight-theme\b"))

        # Wait for CSS transition to complete (0.3s transition in CSS)
        page.wait_for_timeout(400)

        # Verify light background color
        bg_color = page.evaluate("window.getComputedStyle(document.body).backgroundColor")
        assert bg_color == "rgb(255, 255, 255)", f"Expected white bg, got {bg_color}"

        page.screenshot(path=SCREENSHOT_DIR / "02_light_theme.png")

    def test_toggle_back_to_dark_theme(self, page: Page):
        """Clicking again should switch back to dark theme"""
        body = page.locator("body")

        # Toggle to light first
        page.click("#btn-theme-toggle")
        expect(body).to_have_class(re.compile(r"\blight-theme\b"))

        # Toggle back to dark
        page.click("#btn-theme-toggle")
        expect(body).not_to_have_class(re.compile(r"\blight-theme\b"))

        page.screenshot(path=SCREENSHOT_DIR / "03_dark_theme_toggled_back.png")

    def test_theme_persists_after_reload(self, page: Page):
        """Theme preference should persist in localStorage"""
        body = page.locator("body")

        # Switch to light theme
        page.click("#btn-theme-toggle")
        expect(body).to_have_class(re.compile(r"\blight-theme\b"))

        # Reload page (without clearing localStorage)
        page.goto(f"{BASE_URL}?persist_test=1")
        page.wait_for_selector(".status.connected", timeout=5000)

        # Should still be light theme
        expect(page.locator("body")).to_have_class(re.compile(r"\blight-theme\b"))

        page.screenshot(path=SCREENSHOT_DIR / "04_theme_persisted.png")


class TestFullscreen:
    """Tests for fullscreen functionality"""

    def test_fullscreen_toggle(self, page: Page):
        """Clicking fullscreen button should expand mindmap pane"""
        mindmap_pane = page.locator("#mindmap-pane")

        # Initially not fullscreen (class should NOT contain 'fullscreen')
        expect(mindmap_pane).not_to_have_class(re.compile(r"\bfullscreen\b"))

        # Click fullscreen button
        page.click("#btn-fullscreen")

        # Should have fullscreen class (among other classes)
        expect(mindmap_pane).to_have_class(re.compile(r"\bfullscreen\b"))

        # Verify fixed positioning
        position = page.evaluate(
            "window.getComputedStyle(document.getElementById('mindmap-pane')).position"
        )
        assert position == "fixed", f"Expected fixed position, got {position}"

        page.screenshot(path=SCREENSHOT_DIR / "05_fullscreen_on.png", full_page=True)

    def test_exit_fullscreen_with_button(self, page: Page):
        """Clicking fullscreen button again should exit fullscreen"""
        mindmap_pane = page.locator("#mindmap-pane")

        # Enter fullscreen
        page.click("#btn-fullscreen")
        expect(mindmap_pane).to_have_class(re.compile(r"\bfullscreen\b"))

        # Exit fullscreen
        page.click("#btn-fullscreen")
        expect(mindmap_pane).not_to_have_class(re.compile(r"\bfullscreen\b"))

        page.screenshot(path=SCREENSHOT_DIR / "06_fullscreen_off.png")

    def test_exit_fullscreen_with_escape(self, page: Page):
        """Pressing ESC should exit fullscreen"""
        mindmap_pane = page.locator("#mindmap-pane")

        # Enter fullscreen
        page.click("#btn-fullscreen")
        expect(mindmap_pane).to_have_class(re.compile(r"\bfullscreen\b"))

        # Press ESC
        page.keyboard.press("Escape")
        expect(mindmap_pane).not_to_have_class(re.compile(r"\bfullscreen\b"))

        page.screenshot(path=SCREENSHOT_DIR / "07_fullscreen_escaped.png")


class TestFileOperations:
    """Tests for file sidebar and editor"""

    def test_file_list_loads(self, page: Page):
        """File list should populate from /api/files"""
        file_list = page.locator("#file-list")

        # Should have file items
        file_items = file_list.locator(".file-item")
        expect(file_items.first).to_be_visible()

        # Should have module headers
        module_headers = file_list.locator(".module-header")
        expect(module_headers.first).to_be_visible()

        page.screenshot(path=SCREENSHOT_DIR / "08_file_list.png")

    def test_select_file(self, page: Page):
        """Clicking a file should load it in editor"""
        # Click first file item (now shows parent dir name, not content.md)
        page.click(".file-item")

        # Editor should have content
        editor = page.locator("#markdown-editor")
        expect(editor).not_to_be_empty()

        # Current file label should update (still shows actual filename content.md)
        current_file = page.locator("#current-file")
        expect(current_file).to_contain_text("content.md")

        # File should be marked active
        active_item = page.locator(".file-item.active")
        expect(active_item).to_be_visible()

        page.screenshot(path=SCREENSHOT_DIR / "09_file_selected.png")


class TestMindmap:
    """Tests for mindmap functionality"""

    def test_mindmap_renders(self, page: Page):
        """Mindmap should render with content"""
        # Wait for mindmap to have nodes
        page.wait_for_selector("#mindmap .markmap-node", timeout=10000)

        # Should have multiple nodes
        nodes = page.locator("#mindmap .markmap-node")
        count = nodes.count()
        assert count > 5, f"Expected many nodes, got {count}"

        page.screenshot(path=SCREENSHOT_DIR / "10_mindmap_rendered.png")

    def test_fit_to_view(self, page: Page):
        """Fit button should trigger markmap.fit()"""
        # Wait for mindmap to render
        page.wait_for_selector("#mindmap .markmap-node", timeout=10000)

        # Click fit button
        page.click("#btn-fit")

        # Give time for animation
        page.wait_for_timeout(500)

        page.screenshot(path=SCREENSHOT_DIR / "11_mindmap_fitted.png")


class TestIconsAndButtons:
    """Tests for icon visibility and button states"""

    def test_header_buttons_visible(self, page: Page):
        """Header should have theme toggle and refresh buttons"""
        expect(page.locator("#btn-theme-toggle")).to_be_visible()
        expect(page.locator("#btn-refresh")).to_be_visible()

        # Theme toggle should have SVG icon
        theme_svg = page.locator("#btn-theme-toggle svg")
        expect(theme_svg.first).to_be_visible()

    def test_mindmap_pane_buttons_visible(self, page: Page):
        """Mindmap pane should have fit and fullscreen buttons"""
        expect(page.locator("#btn-fit")).to_be_visible()
        expect(page.locator("#btn-fullscreen")).to_be_visible()

        # Fullscreen should have SVG icon
        fs_svg = page.locator("#btn-fullscreen svg")
        expect(fs_svg.first).to_be_visible()

    def test_icon_size(self, page: Page):
        """Icons should be properly sized (2.5rem buttons)"""
        btn = page.locator("#btn-theme-toggle")

        # Get computed dimensions
        width = page.evaluate(
            "window.getComputedStyle(document.getElementById('btn-theme-toggle')).width"
        )
        height = page.evaluate(
            "window.getComputedStyle(document.getElementById('btn-theme-toggle')).height"
        )

        # 2.5rem ≈ 40px at default font size
        assert width == "40px", f"Expected 40px width, got {width}"
        assert height == "40px", f"Expected 40px height, got {height}"

    def test_theme_icon_changes_with_theme(self, page: Page):
        """Sun icon in dark mode, moon icon in light mode"""
        # In dark mode, sun should be visible
        sun = page.locator("#btn-theme-toggle .icon-sun")
        moon = page.locator("#btn-theme-toggle .icon-moon")

        expect(sun).to_be_visible()
        expect(moon).to_be_hidden()

        # Toggle to light mode
        page.click("#btn-theme-toggle")

        expect(sun).to_be_hidden()
        expect(moon).to_be_visible()


class TestResponsive:
    """Tests for responsive behavior"""

    def test_resize_handle(self, page: Page):
        """Resize handle should be draggable"""
        handle = page.locator("#resize-handle")
        expect(handle).to_be_visible()

        # Get initial editor width
        initial_width = page.evaluate(
            "document.querySelector('.editor-pane').offsetWidth"
        )

        # Drag handle to resize (simulate)
        # Note: actual drag testing would need more complex mouse events
        page.screenshot(path=SCREENSHOT_DIR / "12_resize_handle.png")


class TestAgentChat:
    """Tests for Agent Chat panel functionality"""

    def test_agent_panel_visible(self, page: Page):
        """Agent panel should be visible by default"""
        agent_panel = page.locator("#agent-panel")
        expect(agent_panel).to_be_visible()

        # Header elements should be visible
        expect(page.locator("#agent-panel .agent-panel-header")).to_be_visible()
        expect(page.locator("#agent-status")).to_be_visible()
        expect(page.locator("#agent-toggle")).to_be_visible()

        page.screenshot(path=SCREENSHOT_DIR / "13_agent_panel_default.png")

    def test_agent_status_indicator(self, page: Page):
        """Agent status should show Ready or Unavailable"""
        agent_status = page.locator("#agent-status")

        # Wait for status to update from "Checking..."
        page.wait_for_timeout(1000)

        # Status should be either Ready or Unavailable
        status_text = agent_status.inner_text()
        assert status_text in ["Ready", "Unavailable"], (
            f"Expected 'Ready' or 'Unavailable', got '{status_text}'"
        )

        # Send button should always be visible (shows error when clicked if unavailable)
        send_btn = page.locator("#agent-send")
        expect(send_btn).to_be_visible()

        page.screenshot(path=SCREENSHOT_DIR / "14_agent_status.png")

    def test_agent_panel_collapse(self, page: Page):
        """Clicking toggle button should collapse the panel"""
        agent_panel = page.locator("#agent-panel")
        toggle_btn = page.locator("#agent-toggle")

        # Initially expanded (no collapsed class)
        expect(agent_panel).not_to_have_class("collapsed")

        # Click to collapse
        toggle_btn.click()

        # Panel should have collapsed class (uses CSS transform to slide down)
        expect(agent_panel).to_have_class("agent-panel collapsed")

        page.screenshot(path=SCREENSHOT_DIR / "15_agent_panel_collapsed.png")

    def test_agent_panel_expand(self, page: Page):
        """Clicking toggle again should expand the panel"""
        agent_panel = page.locator("#agent-panel")
        toggle_btn = page.locator("#agent-toggle")

        # Collapse first
        toggle_btn.click()
        expect(agent_panel).to_have_class("agent-panel collapsed")

        # Expand again
        toggle_btn.click()
        expect(agent_panel).not_to_have_class("collapsed")

        page.screenshot(path=SCREENSHOT_DIR / "16_agent_panel_expanded.png")

    def test_agent_welcome_message(self, page: Page):
        """Agent panel should show welcome message by default"""
        messages_area = page.locator("#agent-messages")
        welcome_msg = page.locator(".agent-welcome")

        expect(welcome_msg).to_be_visible()
        expect(welcome_msg).to_contain_text("我可以幫你")
        expect(welcome_msg).to_contain_text("瀏覽和理解 mindmap 結構")

        page.screenshot(path=SCREENSHOT_DIR / "17_agent_welcome.png")

    def test_agent_input_elements(self, page: Page):
        """Input area should have textarea and send button"""
        input_area = page.locator(".agent-input-area")
        expect(input_area).to_be_visible()

        # Textarea should be present
        agent_input = page.locator("#agent-input")
        expect(agent_input).to_be_visible()
        expect(agent_input).to_have_attribute("placeholder", "輸入訊息...")

        # Send button should be present
        send_btn = page.locator("#agent-send")
        expect(send_btn).to_be_visible()
        expect(send_btn).to_contain_text("送出")

        page.screenshot(path=SCREENSHOT_DIR / "18_agent_input_area.png")

    def test_agent_input_interaction(self, page: Page):
        """Typing in input should work normally"""
        agent_input = page.locator("#agent-input")

        # Type some text
        test_message = "列出所有 FR"
        agent_input.fill(test_message)

        # Verify text is in input
        expect(agent_input).to_have_value(test_message)

        page.screenshot(path=SCREENSHOT_DIR / "19_agent_input_typed.png")

    def test_agent_send_button_when_unavailable(self, page: Page):
        """Send button behavior when agent is unavailable"""
        agent_status = page.locator("#agent-status")

        # Wait for status check
        page.wait_for_timeout(1000)

        status_text = agent_status.inner_text()
        send_btn = page.locator("#agent-send")

        # Button is always visible (shows error message when clicked if unavailable)
        expect(send_btn).to_be_visible()

        if status_text == "Unavailable":
            page.screenshot(path=SCREENSHOT_DIR / "20_agent_unavailable.png")
        else:
            page.screenshot(path=SCREENSHOT_DIR / "20_agent_available.png")

    def test_agent_panel_position(self, page: Page):
        """Agent panel should be positioned in bottom-right corner"""
        agent_panel = page.locator("#agent-panel")

        # Check CSS position
        position = page.evaluate(
            "window.getComputedStyle(document.getElementById('agent-panel')).position"
        )
        assert position == "fixed", f"Expected fixed position, got {position}"

        # Check bottom and right values
        bottom = page.evaluate(
            "window.getComputedStyle(document.getElementById('agent-panel')).bottom"
        )
        right = page.evaluate(
            "window.getComputedStyle(document.getElementById('agent-panel')).right"
        )

        # Should be positioned at bottom-right (CSS uses right: 20px for spacing)
        assert bottom == "0px", f"Expected bottom: 0px, got {bottom}"
        assert right == "20px", f"Expected right: 20px, got {right}"

    def test_agent_panel_width(self, page: Page):
        """Agent panel should have reasonable width"""
        agent_panel = page.locator("#agent-panel")

        width = page.evaluate(
            "document.getElementById('agent-panel').offsetWidth"
        )

        # Should be around 400px (check style.css for exact value)
        assert width >= 300, f"Panel too narrow: {width}px"
        assert width <= 500, f"Panel too wide: {width}px"


class TestEditorOperations:
    """Tests for editor editing and save functionality"""

    def test_save_button_disabled_initially(self, page: Page):
        """Save button should be disabled when no changes made"""
        # Select a file first
        page.click(".file-item")
        page.wait_for_timeout(500)

        # Save button should be disabled
        save_btn = page.locator("#btn-save")
        expect(save_btn).to_be_disabled()

    def test_save_button_enabled_after_edit(self, page: Page):
        """Save button should be enabled after editing content"""
        # Select a file first
        page.click(".file-item")
        page.wait_for_timeout(500)

        # Type in editor to trigger change
        editor = page.locator("#markdown-editor")
        editor.press("End")
        editor.type(" test change")

        # Save button should now be enabled
        save_btn = page.locator("#btn-save")
        expect(save_btn).not_to_be_disabled()

        page.screenshot(path=SCREENSHOT_DIR / "21_save_button_enabled.png")

    def test_editor_shows_file_content(self, page: Page):
        """Editor should display the selected file's content"""
        # Click on a content.md file (new mindmap structure)
        page.click(".file-item")
        page.wait_for_timeout(500)

        # Editor should contain markdown content
        editor = page.locator("#markdown-editor")
        content = editor.input_value()

        # Should contain some content (could be module content, FR list, or dimension content)
        assert len(content) > 0, "Content should not be empty"

    def test_file_indicator_updates(self, page: Page):
        """Current file indicator should show selected filename"""
        # Click on a file
        page.click(".file-item")
        page.wait_for_timeout(500)

        # File indicator should show the filename
        indicator = page.locator("#current-file")
        expect(indicator).to_contain_text("content.md")


class TestApiTree:
    """Tests for /api/tree endpoint with new mindmap/ directory structure"""

    def test_api_tree_returns_valid_json(self, page: Page):
        """Test /api/tree returns valid JSON"""
        response = page.evaluate("""
            fetch('/api/tree')
                .then(r => r.json())
                .catch(e => ({ error: e.message }))
        """)
        assert "error" not in response, f"API returned error: {response.get('error')}"
        assert "title" in response, "Response missing 'title' field"
        assert "modules" in response, "Response missing 'modules' field"

    def test_api_tree_has_all_modules(self, page: Page):
        """Test response contains all 6 modules"""
        response = page.evaluate("fetch('/api/tree').then(r => r.json())")
        modules = response["modules"]

        assert len(modules) == 6, f"Expected 6 modules, got {len(modules)}"

        # Check module IDs and names
        expected_modules = {
            "01_map": "地圖站點",
            "02_volunteer_tasks": "志工任務",
            "03_delivery": "配送模組",
            "04_info_page": "資訊頁面",
            "05_moderator_admin": "審核後台",
            "06_system_admin": "系統管理"
        }

        for module in modules:
            module_id = module["id"]
            assert module_id in expected_modules, f"Unexpected module ID: {module_id}"
            assert module["name"] == expected_modules[module_id], \
                f"Module {module_id} has wrong name: {module['name']}"

    def test_api_tree_module_structure(self, page: Page):
        """Test each module has correct structure"""
        response = page.evaluate("fetch('/api/tree').then(r => r.json())")
        modules = response["modules"]

        for module in modules:
            # Each module should have these fields
            assert "id" in module, f"Module missing 'id': {module}"
            assert "name" in module, f"Module missing 'name': {module}"
            assert "content" in module, f"Module missing 'content': {module}"
            assert "requirements" in module, f"Module missing 'requirements': {module}"

            # Requirements should have content and dimensions
            req = module["requirements"]
            assert "content" in req, f"Requirements missing 'content' in {module['id']}"
            assert "dimensions" in req, f"Requirements missing 'dimensions' in {module['id']}"

            # Check all 4 dimensions exist
            dims = req["dimensions"]
            for dim_key in ["ui_ux", "frontend", "backend", "ai_data"]:
                assert dim_key in dims, f"Missing dimension '{dim_key}' in {module['id']}"
                assert "content" in dims[dim_key], \
                    f"Dimension '{dim_key}' missing content in {module['id']}"

    def test_api_tree_backend_has_specs(self, page: Page):
        """Test that backend dimension has specs section"""
        response = page.evaluate("fetch('/api/tree').then(r => r.json())")
        modules = response["modules"]

        # At least one module should have specs in backend
        has_specs = False
        for module in modules:
            backend = module["requirements"]["dimensions"]["backend"]
            if "specs" in backend and backend["specs"].get("content"):
                has_specs = True
                # Verify specs has content
                assert "content" in backend["specs"], \
                    f"Backend specs missing content in {module['id']}"

        assert has_specs, "No module has specs in backend dimension"


class TestMindmapStructure:
    """Tests for mindmap rendering with new mindmap/ directory structure"""

    def test_mindmap_shows_all_modules(self, page: Page):
        """Mindmap should show all 6 modules with correct names"""
        page.wait_for_selector("#mindmap .markmap-node", timeout=10000)

        # Get text from mindmap SVG using JavaScript (SVG doesn't support inner_text)
        mindmap_text = page.evaluate(
            "document.getElementById('mindmap').textContent"
        )

        modules = ["地圖站點", "志工任務", "配送模組", "資訊頁面", "審核後台", "系統管理"]
        for module in modules:
            assert module in mindmap_text, f"Module '{module}' not found in mindmap"

        page.screenshot(path=SCREENSHOT_DIR / "22_all_modules.png")

    def test_mindmap_shows_fr_items(self, page: Page):
        """Mindmap should show FR items from all modules"""
        page.wait_for_selector("#mindmap .markmap-node", timeout=10000)

        # Get text from mindmap SVG using JavaScript
        mindmap_text = page.evaluate(
            "document.getElementById('mindmap').textContent"
        )

        # Check for FR items from different modules
        fr_prefixes = ["FR-MAP-", "FR-TASK-", "FR-DELIVERY-", "FR-INFO-", "FR-MOD-", "FR-ADMIN-"]
        for prefix in fr_prefixes:
            assert prefix in mindmap_text, f"FR items with '{prefix}' not found in mindmap"

    def test_mindmap_shows_dimensions(self, page: Page):
        """Mindmap should show all 4 dimensions"""
        page.wait_for_selector("#mindmap .markmap-node", timeout=10000)

        mindmap_text = page.evaluate(
            "document.getElementById('mindmap').textContent"
        )

        # All dimensions should appear in mindmap
        dimensions = ["UI/UX", "Frontend", "Backend", "AI & Data"]
        for dimension in dimensions:
            assert dimension in mindmap_text, f"Dimension '{dimension}' not found in mindmap"

    def test_mindmap_shows_specs_section(self, page: Page):
        """Mindmap should show SPEC 連結 section under Backend"""
        page.wait_for_selector("#mindmap .markmap-node", timeout=10000)

        mindmap_text = page.evaluate(
            "document.getElementById('mindmap').textContent"
        )

        # SPEC 連結 should appear (as a subsection under Backend)
        assert "SPEC 連結" in mindmap_text or "SPEC" in mindmap_text, \
            "SPEC section not found in mindmap"

    def test_mindmap_node_count(self, page: Page):
        """Mindmap should have significant number of nodes (all FR items)"""
        page.wait_for_selector("#mindmap .markmap-node", timeout=10000)

        nodes = page.locator("#mindmap .markmap-node")
        count = nodes.count()

        # Should have many nodes (6 modules + ~50 FR items + dimensions + specs)
        # With new structure, we expect more nodes since each content.md creates nodes
        assert count > 30, f"Expected many nodes, got only {count}"

    def test_mindmap_module_hierarchy(self, page: Page):
        """Mindmap should have correct hierarchy: Module → 功能需求 → Dimensions"""
        page.wait_for_selector("#mindmap .markmap-node", timeout=10000)

        mindmap_text = page.evaluate(
            "document.getElementById('mindmap').textContent"
        )

        # Check that module content (User stories) appears
        # These are from module-level content.md files
        assert "User" in mindmap_text or "災民" in mindmap_text, \
            "User stories not found in mindmap"

    def test_mindmap_renders_multiline_content(self, page: Page):
        """Mindmap should render multiline content correctly"""
        page.wait_for_selector("#mindmap .markmap-node", timeout=10000)

        # Check that multiline content from content.md appears
        # In the new structure, multiline text is in content.md files
        mindmap_text = page.evaluate(
            "document.getElementById('mindmap').textContent"
        )

        # Should contain text from content.md (which has multiline content)
        # For example, FR descriptions from requirements/content.md
        assert "FR-MAP-01" in mindmap_text, "FR items not rendered in mindmap"


class TestEditMode:
    """Tests for edit mode toggle functionality"""

    def test_edit_mode_checkbox_exists(self, page: Page):
        """Edit mode checkbox should exist"""
        checkbox = page.locator("#toggle-edit-mode")
        expect(checkbox).to_be_visible()

    def test_edit_mode_toggle(self, page: Page):
        """Clicking edit mode checkbox should toggle edit mode"""
        checkbox = page.locator("#toggle-edit-mode")
        mindmap_pane = page.locator("#mindmap-pane")

        # Initially not in edit mode
        expect(mindmap_pane).not_to_have_class(re.compile(r"\bedit-mode\b"))

        # Enable edit mode
        checkbox.click()
        expect(mindmap_pane).to_have_class(re.compile(r"\bedit-mode\b"))

        # Disable edit mode
        checkbox.click()
        expect(mindmap_pane).not_to_have_class(re.compile(r"\bedit-mode\b"))

        page.screenshot(path=SCREENSHOT_DIR / "23_edit_mode_toggle.png")


class TestKeyboardShortcuts:
    """Tests for keyboard shortcuts"""

    def test_ctrl_s_triggers_save(self, page: Page):
        """Ctrl+S should trigger save when file is dirty"""
        # Select a file
        page.click(".file-item")
        page.wait_for_timeout(500)

        # Make a change
        editor = page.locator("#markdown-editor")
        original_content = editor.input_value()
        editor.press("End")
        editor.type(" ")  # Small change

        # Save button should be enabled
        save_btn = page.locator("#btn-save")
        expect(save_btn).not_to_be_disabled()

        # Press Ctrl+S (this triggers save, button should become disabled)
        page.keyboard.press("Control+s")
        page.wait_for_timeout(1000)

        # After save, button should be disabled again
        expect(save_btn).to_be_disabled()


class TestMindmapToolbar:
    """Tests for mindmap toolbar controls"""

    def test_zoom_controls_visible(self, page: Page):
        """Zoom in/out controls should be visible"""
        page.wait_for_selector(".mm-toolbar", timeout=10000)

        toolbar = page.locator(".mm-toolbar")
        expect(toolbar).to_be_visible()

    def test_fit_button_works(self, page: Page):
        """Fit button should work without errors"""
        page.wait_for_selector("#mindmap .markmap-node", timeout=10000)

        # Click fit button
        page.click("#btn-fit")
        page.wait_for_timeout(500)

        # Should not cause any errors (check console)
        # The mindmap should still have nodes
        nodes = page.locator("#mindmap .markmap-node")
        count = nodes.count()
        assert count > 0, "Mindmap nodes disappeared after fit"


class TestEditModal:
    """Tests for edit modal functionality (click-to-edit mindmap nodes)"""

    def test_modal_initially_hidden(self, page: Page):
        """Edit modal should be hidden by default"""
        modal = page.locator("#edit-modal")
        expect(modal).to_have_class(re.compile(r"\bhidden\b"))

    def test_modal_opens_on_node_click_in_edit_mode(self, page: Page):
        """Clicking a mindmap node in edit mode should open modal"""
        page.wait_for_selector("#mindmap .markmap-node", timeout=10000)

        # Enable edit mode
        page.click("#toggle-edit-mode")
        page.wait_for_timeout(300)

        # Click on a mindmap node (first FR item)
        node = page.locator("#mindmap .markmap-node").first
        node.click()
        page.wait_for_timeout(300)

        # Modal should be visible (hidden class removed)
        modal = page.locator("#edit-modal")
        expect(modal).not_to_have_class(re.compile(r"\bhidden\b"))

        page.screenshot(path=SCREENSHOT_DIR / "24_edit_modal_open.png")

    def test_modal_contains_node_text(self, page: Page):
        """Modal input should contain the clicked node's text"""
        page.wait_for_selector("#mindmap .markmap-node", timeout=10000)

        # Enable edit mode and click a node
        page.click("#toggle-edit-mode")
        page.wait_for_timeout(300)

        # Get text from a specific node before clicking
        node = page.locator("#mindmap .markmap-node").first
        node.click()
        page.wait_for_timeout(300)

        # Modal input should have some text (node content)
        edit_input = page.locator("#edit-input")
        input_value = edit_input.input_value()
        assert len(input_value) > 0, "Edit input should contain node text"

    def test_cancel_button_closes_modal(self, page: Page):
        """Cancel button should close modal without saving"""
        page.wait_for_selector("#mindmap .markmap-node", timeout=10000)

        # Enable edit mode and open modal
        page.click("#toggle-edit-mode")
        page.wait_for_timeout(300)
        page.locator("#mindmap .markmap-node").first.click()
        page.wait_for_timeout(300)

        # Modal should be open
        modal = page.locator("#edit-modal")
        expect(modal).not_to_have_class(re.compile(r"\bhidden\b"))

        # Click cancel
        page.click("#edit-cancel")
        page.wait_for_timeout(300)

        # Modal should be hidden again
        expect(modal).to_have_class(re.compile(r"\bhidden\b"))

        page.screenshot(path=SCREENSHOT_DIR / "25_edit_modal_cancelled.png")

    def test_click_outside_modal_closes_it(self, page: Page):
        """Clicking outside modal content should close modal"""
        page.wait_for_selector("#mindmap .markmap-node", timeout=10000)

        # Enable edit mode and open modal
        page.click("#toggle-edit-mode")
        page.wait_for_timeout(300)
        page.locator("#mindmap .markmap-node").first.click()
        page.wait_for_timeout(300)

        # Modal should be open
        modal = page.locator("#edit-modal")
        expect(modal).not_to_have_class(re.compile(r"\bhidden\b"))

        # Click on the modal backdrop (outside .modal-content)
        # Use JavaScript to click on the modal element itself (not the content)
        page.evaluate("document.getElementById('edit-modal').click()")
        page.wait_for_timeout(300)

        # Modal should be hidden
        expect(modal).to_have_class(re.compile(r"\bhidden\b"))

    def test_modal_has_correct_elements(self, page: Page):
        """Modal should have title, input, cancel and save buttons"""
        page.wait_for_selector("#mindmap .markmap-node", timeout=10000)

        # Enable edit mode and open modal
        page.click("#toggle-edit-mode")
        page.wait_for_timeout(300)
        page.locator("#mindmap .markmap-node").first.click()
        page.wait_for_timeout(300)

        # Check modal elements
        expect(page.locator("#edit-modal h3")).to_contain_text("Edit Node")
        expect(page.locator("#edit-input")).to_be_visible()
        expect(page.locator("#edit-cancel")).to_be_visible()
        expect(page.locator("#edit-save")).to_be_visible()

    def test_node_click_without_edit_mode_does_not_open_modal(self, page: Page):
        """Clicking node without edit mode should NOT open modal"""
        page.wait_for_selector("#mindmap .markmap-node", timeout=10000)

        # Make sure edit mode is OFF (don't click the toggle)
        mindmap_pane = page.locator("#mindmap-pane")
        expect(mindmap_pane).not_to_have_class(re.compile(r"\bedit-mode\b"))

        # Click on a mindmap node
        node = page.locator("#mindmap .markmap-node").first
        node.click()
        page.wait_for_timeout(300)

        # Modal should still be hidden
        modal = page.locator("#edit-modal")
        expect(modal).to_have_class(re.compile(r"\bhidden\b"))

    def test_save_button_closes_modal(self, page: Page):
        """Save button should close modal"""
        page.wait_for_selector("#mindmap .markmap-node", timeout=10000)

        # Enable edit mode and open modal
        page.click("#toggle-edit-mode")
        page.wait_for_timeout(300)
        page.locator("#mindmap .markmap-node").first.click()
        page.wait_for_timeout(300)

        # Modal should be open
        modal = page.locator("#edit-modal")
        expect(modal).not_to_have_class(re.compile(r"\bhidden\b"))

        # Click save (don't modify content, just test that it closes)
        page.click("#edit-save")
        page.wait_for_timeout(500)

        # Modal should be hidden
        expect(modal).to_have_class(re.compile(r"\bhidden\b"))

        page.screenshot(path=SCREENSHOT_DIR / "26_edit_modal_saved.png")


class TestFileListDisplay:
    """Tests for file list display names (Bug fix: show parent dir instead of content.md)"""

    def test_file_list_shows_parent_dir_names(self, page: Page):
        """File list should show parent directory names, not 'content.md'"""
        file_list = page.locator("#file-list")

        # Get all file item texts
        file_items = file_list.locator(".file-item")
        count = file_items.count()
        assert count > 0, "No file items found"

        # Check that no file item shows "content.md"
        for i in range(count):
            item_text = file_items.nth(i).inner_text()
            assert "content.md" not in item_text, \
                f"File item should show parent dir, not 'content.md': {item_text}"

        page.screenshot(path=SCREENSHOT_DIR / "27_file_list_parent_dirs.png")

    def test_file_list_shows_meaningful_names(self, page: Page):
        """File list should show meaningful directory names"""
        file_list = page.locator("#file-list")

        # Get text from all file items
        file_items = file_list.locator(".file-item")
        item_texts = [file_items.nth(i).inner_text() for i in range(file_items.count())]

        # Should contain dimension names
        expected_names = ["ui_ux", "frontend", "backend", "ai_data", "specs", "requirements"]
        found_names = []
        for name in expected_names:
            if any(name in text for text in item_texts):
                found_names.append(name)

        assert len(found_names) >= 3, \
            f"Expected to find dimension names like {expected_names}, found: {found_names}"

    def test_file_list_shows_module_names(self, page: Page):
        """File list should show module directory names"""
        file_list = page.locator("#file-list")

        file_items = file_list.locator(".file-item")
        item_texts = [file_items.nth(i).inner_text() for i in range(file_items.count())]

        # Should contain module names
        module_names = ["01_map", "02_volunteer_tasks", "03_delivery",
                       "04_info_page", "05_moderator_admin", "06_system_admin"]
        found_modules = []
        for name in module_names:
            if any(name in text for text in item_texts):
                found_modules.append(name)

        assert len(found_modules) >= 3, \
            f"Expected to find module names, found: {found_modules}"


class TestZoomPreservation:
    """Tests for zoom level preservation when folding nodes"""

    def test_zoom_preserved_after_fold(self, page: Page):
        """Zoom level should be preserved after clicking fold/toggle button"""
        page.wait_for_selector("#mindmap .markmap-node", timeout=10000)

        # Collapse agent panel to avoid it blocking toolbar clicks
        page.click("#agent-toggle")
        page.wait_for_timeout(300)

        # Get initial zoom transform
        initial_transform = page.evaluate("""
            () => {
                const svg = document.getElementById('mindmap');
                const transform = d3.zoomTransform(svg);
                return { k: transform.k, x: transform.x, y: transform.y };
            }
        """)

        # Zoom in 3 times
        for _ in range(3):
            page.click(".mm-toolbar [title='Zoom in']")
            page.wait_for_timeout(200)

        # Get zoom after zooming in
        zoomed_transform = page.evaluate("""
            () => {
                const svg = document.getElementById('mindmap');
                const transform = d3.zoomTransform(svg);
                return { k: transform.k, x: transform.x, y: transform.y };
            }
        """)

        # Verify zoom changed
        assert zoomed_transform["k"] > initial_transform["k"], \
            "Zoom level should increase after zoom in"

        # Click toggle recursively (fold) button
        page.click(".mm-toolbar [title='Toggle recursively']")
        page.wait_for_timeout(1000)  # Wait for animation to complete

        # Get zoom after fold
        after_fold_transform = page.evaluate("""
            () => {
                const svg = document.getElementById('mindmap');
                const transform = d3.zoomTransform(svg);
                return { k: transform.k, x: transform.x, y: transform.y };
            }
        """)

        # Zoom level should be preserved (allow 5% tolerance for minor adjustments)
        zoom_diff = abs(after_fold_transform["k"] - zoomed_transform["k"])
        tolerance = zoomed_transform["k"] * 0.05  # 5% tolerance
        assert zoom_diff < tolerance, \
            f"Zoom level changed too much after fold: {zoomed_transform['k']} -> {after_fold_transform['k']} (diff: {zoom_diff}, tolerance: {tolerance})"

        page.screenshot(path=SCREENSHOT_DIR / "28_zoom_preserved_after_fold.png")

    def test_zoom_preserved_after_theme_toggle(self, page: Page):
        """Zoom level should be preserved after toggling theme"""
        page.wait_for_selector("#mindmap .markmap-node", timeout=10000)

        # Collapse agent panel to avoid it blocking toolbar clicks
        page.click("#agent-toggle")
        page.wait_for_timeout(300)

        # Zoom in
        for _ in range(2):
            page.click(".mm-toolbar [title='Zoom in']")
            page.wait_for_timeout(200)

        # Get zoom before theme toggle
        before_transform = page.evaluate("""
            () => {
                const svg = document.getElementById('mindmap');
                const transform = d3.zoomTransform(svg);
                return { k: transform.k, x: transform.x, y: transform.y };
            }
        """)

        # Toggle theme
        page.click("#btn-theme-toggle")
        page.wait_for_timeout(1000)  # Wait for transition to complete

        # Get zoom after theme toggle
        after_transform = page.evaluate("""
            () => {
                const svg = document.getElementById('mindmap');
                const transform = d3.zoomTransform(svg);
                return { k: transform.k, x: transform.x, y: transform.y };
            }
        """)

        # Zoom level should be preserved (allow 5% tolerance)
        zoom_diff = abs(after_transform["k"] - before_transform["k"])
        tolerance = before_transform["k"] * 0.05  # 5% tolerance
        assert zoom_diff < tolerance, \
            f"Zoom changed too much after theme toggle: {before_transform['k']} -> {after_transform['k']} (diff: {zoom_diff}, tolerance: {tolerance})"

        page.screenshot(path=SCREENSHOT_DIR / "29_zoom_preserved_after_theme.png")


# Run a quick smoke test if executed directly
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--headed", "-x"])

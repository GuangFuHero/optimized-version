/**
 * Mindmap Editor - Frontend Logic
 *
 * Features:
 * - Load and display markdown files
 * - Edit markdown with live mindmap preview
 * - Click nodes in mindmap to edit (when edit mode enabled)
 * - WebSocket for real-time sync
 */

// Global state
const state = {
    currentFile: null,
    files: [],
    isDirty: false,
    editMode: false,
    ws: null,
    markmap: null,
    transformer: null,
    allMarkdown: '',  // Combined markdown for mindmap
    aiAvailable: false,
    aiResponse: '',   // Current AI response for apply/copy
    isDarkTheme: true,   // Theme state (default: dark)
    isFullscreen: false, // Fullscreen state
};

// Application configuration (loaded from server)
let appConfig = {
    mindmap: { maxFrItems: 100, maxDimensionItems: 100, maxDescriptionLength: 200 }
};

// DOM elements
const elements = {
    fileList: document.getElementById('file-list'),
    currentFile: document.getElementById('current-file'),
    editor: document.getElementById('markdown-editor'),
    mindmap: document.getElementById('mindmap'),
    btnSave: document.getElementById('btn-save'),
    btnRefresh: document.getElementById('btn-refresh'),
    btnFit: document.getElementById('btn-fit'),
    toggleEditMode: document.getElementById('toggle-edit-mode'),
    connectionStatus: document.getElementById('connection-status'),
    editModal: document.getElementById('edit-modal'),
    editInput: document.getElementById('edit-input'),
    editCancel: document.getElementById('edit-cancel'),
    editSave: document.getElementById('edit-save'),
    // Theme & fullscreen elements
    mindmapPane: document.getElementById('mindmap-pane'),
    btnThemeToggle: document.getElementById('btn-theme-toggle'),
    btnFullscreen: document.getElementById('btn-fullscreen'),
    // AI elements
    aiPanel: document.getElementById('ai-panel'),
    aiStatus: document.getElementById('ai-status'),
    aiToggle: document.getElementById('ai-toggle'),
    aiCustomInput: document.getElementById('ai-custom-input'),
    aiCustomPrompt: document.getElementById('ai-custom-prompt'),
    aiCustomSend: document.getElementById('ai-custom-send'),
    aiResponse: document.getElementById('ai-response'),
    aiResponseActions: document.getElementById('ai-response-actions'),
    aiApply: document.getElementById('ai-apply'),
    aiCopy: document.getElementById('ai-copy'),
};

// Color palettes for different themes
const colorPalettes = {
    // Light theme (Whimsical-style) - darker colors for white background
    light: [
        '#2D7DD2', // blue
        '#E85D75', // rose
        '#8E44AD', // purple
        '#27AE60', // green
        '#E67E22', // orange
        '#3498DB', // sky blue
        '#9B59B6', // amethyst
        '#1ABC9C', // turquoise
    ],
    // Dark theme - bright colors for dark background
    dark: [
        '#4ECDC4', // teal (accent)
        '#FF6B6B', // coral red
        '#C9B1FF', // lavender
        '#FFE66D', // yellow
        '#95E1D3', // mint
        '#F38181', // salmon
        '#A8E6CF', // light green
        '#DDA0DD', // plum
    ],
};

// Load configuration from server
async function loadConfig() {
    try {
        const response = await fetch('/api/config');
        appConfig = await response.json();
        console.log('Configuration loaded:', appConfig);
    } catch (e) {
        console.warn('Could not load config, using defaults:', e);
    }
}

// Initialize
async function init() {
    console.log('Initializing Mindmap Editor...');

    // Load configuration first
    await loadConfig();

    // Load saved theme preference (default is dark)
    const savedTheme = localStorage.getItem('mindmap-theme');
    state.isDarkTheme = savedTheme !== 'light'; // Dark unless explicitly set to light
    applyTheme(state.isDarkTheme);

    // Initialize markmap
    // All markmap packages merge into window.markmap
    // Load order matters: markmap-lib must load before markmap-view
    state.transformer = new markmap.Transformer();

    state.markmap = markmap.Markmap.create(elements.mindmap, {
        autoFit: true,
        color: (node) => getNodeColor(node),
        duration: 300,
        maxWidth: 300,
    });

    // Add toolbar
    const toolbar = new markmap.Toolbar();
    toolbar.attach(state.markmap);
    const toolbarEl = toolbar.render();
    toolbarEl.classList.add('mm-toolbar');
    elements.mindmap.parentElement.appendChild(toolbarEl);

    // Monkey patch markmap.fit to preserve zoom by default
    // Store original fit method
    const originalFit = state.markmap.fit.bind(state.markmap);
    state.markmap._originalFit = originalFit;
    state.markmap._allowFit = true;  // Flag to control fit behavior

    // Override fit to only work when explicitly allowed
    state.markmap.fit = function() {
        if (state.markmap._allowFit) {
            originalFit();
        }
        // When _allowFit is false, fit() does nothing (preserves zoom)
    };

    // After initial render, disable auto-fit
    setTimeout(() => {
        state.markmap._allowFit = false;
    }, 500);

    // Load files
    await loadFiles();

    // Connect WebSocket
    connectWebSocket();

    // Setup event listeners
    setupEventListeners();

    // Load combined markdown for mindmap (fit to viewport on initial load)
    await loadAllMarkdown(true);

    // Check Agent availability and setup
    await checkAgentStatus();
    setupAgentEventListeners();

    console.log('Editor initialized!');
}

// Load file list from server
async function loadFiles() {
    try {
        const response = await fetch('/api/files');
        const data = await response.json();
        state.files = data.files;
        renderFileList();
    } catch (error) {
        console.error('Failed to load files:', error);
    }
}

// Render file list in sidebar
function renderFileList() {
    elements.fileList.innerHTML = '';

    // Group by module
    const modules = {};
    for (const file of state.files) {
        const module = file.module || '_root';
        if (!modules[module]) modules[module] = [];
        modules[module].push(file);
    }

    for (const [module, files] of Object.entries(modules)) {
        if (module !== '_root') {
            const header = document.createElement('div');
            header.className = 'module-header';
            header.textContent = module;
            elements.fileList.appendChild(header);
        }

        for (const file of files) {
            const item = document.createElement('div');
            item.className = 'file-item';
            item.dataset.path = file.path;
            // Display parent directory name instead of "content.md"
            const pathParts = file.path.split('/');
            const displayName = pathParts.length >= 2 ? pathParts[pathParts.length - 2] : file.name;
            item.innerHTML = `
                <span class="icon">📄</span>
                <span>${displayName}</span>
            `;
            item.addEventListener('click', () => selectFile(file.path));
            elements.fileList.appendChild(item);
        }
    }
}

// Select and load a file
async function selectFile(path) {
    // Check for unsaved changes
    if (state.isDirty) {
        if (!confirm('You have unsaved changes. Discard?')) return;
    }

    try {
        const response = await fetch(`/api/files/${encodeURIComponent(path)}`);
        const data = await response.json();

        state.currentFile = path;
        state.isDirty = false;

        // Update file indicator (show just filename)
        const filename = path.split('/').pop();
        elements.currentFile.textContent = filename;
        elements.currentFile.classList.add('has-file');
        elements.currentFile.title = path; // Full path in tooltip

        elements.editor.value = data.content;
        elements.btnSave.disabled = true;

        // Update active state in sidebar
        document.querySelectorAll('.file-item').forEach(el => {
            el.classList.toggle('active', el.dataset.path === path);
        });

        // Update mindmap to highlight current file's content
        updateMindmap();

    } catch (error) {
        console.error('Failed to load file:', error);
        alert(`Failed to load file: ${error.message}`);
    }
}

// Save current file
async function saveFile() {
    if (!state.currentFile || !state.isDirty) return;

    try {
        const response = await fetch(`/api/files/${encodeURIComponent(state.currentFile)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: state.currentFile,
                content: elements.editor.value
            })
        });

        if (response.ok) {
            state.isDirty = false;
            elements.btnSave.disabled = true;
            console.log('File saved:', state.currentFile);

            // Reload all markdown and update mindmap
            await loadAllMarkdown();
        } else {
            throw new Error('Save failed');
        }
    } catch (error) {
        console.error('Failed to save file:', error);
        alert(`Failed to save: ${error.message}`);
    }
}

// Load all markdown files and combine for mindmap
// shouldFitMindmap: true = fit mindmap to viewport after loading (for initial load)
async function loadAllMarkdown(shouldFitMindmap = false) {
    try {
        // Fetch tree data from new API
        const response = await fetch('/api/tree');
        const treeData = await response.json();

        let markdown = `# ${treeData.title}\n\n`;

        for (const module of treeData.modules) {
            // Module heading with content as <br> separated text
            const moduleContent = module.content ?
                module.content.trim().split('\n').filter(line => line.trim()).join('<br>') : '';
            markdown += `## ${module.name}${moduleContent ? '<br>' + moduleContent : ''}\n\n`;

            // Requirements section
            if (module.requirements) {
                const reqContent = module.requirements.content ?
                    module.requirements.content.trim().split('\n').filter(line => line.trim()).join('<br>') : '';
                markdown += `### 功能需求${reqContent ? '<br>' + reqContent : ''}\n\n`;

                // Dimensions in specific order
                const dimensions = module.requirements.dimensions || {};
                const dimOrder = ['ui_ux', 'frontend', 'backend', 'ai_data'];
                const dimNames = {
                    ui_ux: 'UI/UX',
                    frontend: 'Frontend',
                    backend: 'Backend',
                    ai_data: 'AI & Data'
                };

                for (const dimKey of dimOrder) {
                    const dim = dimensions[dimKey];
                    if (dim && dim.content) {
                        const dimContent = dim.content.trim().split('\n').filter(line => line.trim()).join('<br>');
                        markdown += `#### ${dimNames[dimKey]}<br>${dimContent}\n\n`;

                        // SPEC links under backend
                        if (dimKey === 'backend' && dim.specs && dim.specs.content) {
                            const specContent = dim.specs.content.trim().split('\n').filter(line => line.trim()).join('<br>');
                            markdown += `##### SPEC 連結<br>${specContent}\n\n`;
                        }
                    }
                }
            }
        }

        state.allMarkdown = markdown;
        updateMindmap(shouldFitMindmap);

    } catch (error) {
        console.error('Failed to load all markdown:', error);
    }
}

// Update mindmap visualization
// shouldFit: true = fit to viewport (for initial load), false = preserve current zoom
function updateMindmap(shouldFit = false) {
    if (!state.transformer || !state.markmap) return;

    try {
        const { root } = state.transformer.transform(state.allMarkdown);
        state.markmap.setData(root);

        if (shouldFit && state.markmap._originalFit) {
            // Use original fit when explicitly requested
            state.markmap._originalFit();
        }
        // When shouldFit is false, zoom is automatically preserved
        // because markmap.fit is patched to do nothing
    } catch (error) {
        console.error('Failed to update mindmap:', error);
    }
}

// Connect WebSocket for real-time updates
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    state.ws = new WebSocket(wsUrl);

    state.ws.onopen = () => {
        console.log('WebSocket connected');
        elements.connectionStatus.textContent = '● Connected';
        elements.connectionStatus.className = 'status connected';
    };

    state.ws.onclose = () => {
        console.log('WebSocket disconnected');
        elements.connectionStatus.textContent = '● Disconnected';
        elements.connectionStatus.className = 'status disconnected';

        // Reconnect after 3 seconds
        setTimeout(connectWebSocket, 3000);
    };

    state.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };

    state.ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        handleWebSocketMessage(message);
    };
}

// Handle incoming WebSocket messages
function handleWebSocketMessage(message) {
    switch (message.type) {
        case 'file_updated':
            // Reload if it's the current file
            if (message.path === state.currentFile && !state.isDirty) {
                elements.editor.value = message.content;
            }
            // Reload mindmap
            loadAllMarkdown();
            break;

        case 'sync':
            // Handle full sync
            console.log('Received sync:', message);
            break;

        case 'update_success':
            console.log('Update successful:', message.path);
            break;

        case 'error':
            console.error('Server error:', message.message);
            alert(`Error: ${message.message}`);
            break;
    }
}

// Setup event listeners
function setupEventListeners() {
    // Editor changes
    elements.editor.addEventListener('input', () => {
        state.isDirty = true;
        elements.btnSave.disabled = false;
    });

    // Save button
    elements.btnSave.addEventListener('click', saveFile);

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveFile();
        }
    });

    // Refresh button
    elements.btnRefresh.addEventListener('click', async () => {
        await loadFiles();
        await loadAllMarkdown();
    });

    // Fit button - use original fit to actually fit to viewport
    elements.btnFit.addEventListener('click', () => {
        state.markmap?._originalFit?.() || state.markmap?.fit();
    });

    // Edit mode toggle
    elements.toggleEditMode.addEventListener('change', (e) => {
        state.editMode = e.target.checked;
        const pane = elements.mindmap.parentElement;
        pane.classList.toggle('edit-mode', state.editMode);

        if (state.editMode) {
            enableNodeEditing();
        } else {
            disableNodeEditing();
        }
    });

    // Modal events
    elements.editCancel.addEventListener('click', closeEditModal);
    elements.editSave.addEventListener('click', saveNodeEdit);
    elements.editModal.addEventListener('click', (e) => {
        if (e.target === elements.editModal) closeEditModal();
    });

    // Theme toggle
    setupThemeToggle();

    // Fullscreen toggle
    setupFullscreenToggle();

    // Resize handle
    setupResizeHandle();
}

// Enable click-to-edit on mindmap nodes
function enableNodeEditing() {
    const svg = elements.mindmap;

    svg.addEventListener('click', handleNodeClick);
}

// Disable node editing
function disableNodeEditing() {
    const svg = elements.mindmap;
    svg.removeEventListener('click', handleNodeClick);
}

// Handle click on mindmap node
function handleNodeClick(e) {
    if (!state.editMode) return;

    // Find the clicked node
    const node = e.target.closest('.markmap-node');
    if (!node) return;

    // Get the text content
    const textEl = node.querySelector('foreignObject div, text');
    if (!textEl) return;

    const text = textEl.textContent || textEl.innerText;
    if (!text) return;

    // Open edit modal
    openEditModal(text, node);
}

// Edit modal state
let currentEditNode = null;
let currentEditText = '';

function openEditModal(text, node) {
    currentEditNode = node;
    currentEditText = text;

    elements.editInput.value = text;
    elements.editModal.classList.remove('hidden');
    elements.editInput.focus();
    elements.editInput.select();
}

function closeEditModal() {
    elements.editModal.classList.add('hidden');
    currentEditNode = null;
    currentEditText = '';
}

async function saveNodeEdit() {
    const newText = elements.editInput.value.trim();
    if (!newText || newText === currentEditText) {
        closeEditModal();
        return;
    }

    // Find which file contains this text and update it using line-based matching
    for (const file of state.files) {
        if (file.name !== 'requirements.md') continue;

        try {
            const response = await fetch(`/api/files/${encodeURIComponent(file.path)}`);
            const data = await response.json();

            // Split content into lines to find exact line
            const lines = data.content.split('\n');
            let targetLineIdx = -1;

            // Find the line containing the old text
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes(currentEditText)) {
                    targetLineIdx = i;
                    break;
                }
            }

            if (targetLineIdx !== -1) {
                // Found the file and line, update it
                lines[targetLineIdx] = lines[targetLineIdx].replace(currentEditText, newText);
                const newContent = lines.join('\n');

                await fetch(`/api/files/${encodeURIComponent(file.path)}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        path: file.path,
                        content: newContent
                    })
                });

                console.log(`Updated ${file.path} line ${targetLineIdx + 1}: "${currentEditText}" -> "${newText}"`);

                // Reload if this is current file
                if (file.path === state.currentFile) {
                    elements.editor.value = newContent;
                }

                // Reload mindmap
                await loadAllMarkdown();

                break;
            }
        } catch (error) {
            console.error('Error updating file:', error);
        }
    }

    closeEditModal();
}

// Setup resizable panes
function setupResizeHandle() {
    const handle = document.getElementById('resize-handle');
    const editorPane = document.querySelector('.editor-pane');
    let isResizing = false;

    handle.addEventListener('mousedown', (e) => {
        isResizing = true;
        document.body.style.cursor = 'col-resize';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        const containerWidth = editorPane.parentElement.offsetWidth;
        const newWidth = e.clientX - editorPane.parentElement.offsetLeft - 200; // 200 = sidebar width
        const percentage = (newWidth / containerWidth) * 100;

        if (percentage > 15 && percentage < 70) {
            editorPane.style.width = `${percentage}%`;
        }
    });

    document.addEventListener('mouseup', () => {
        isResizing = false;
        document.body.style.cursor = '';
    });
}

// --- AI Assistant Functions ---

// Check if AI is available
async function checkAIStatus() {
    try {
        const response = await fetch('/api/ai/status');
        const data = await response.json();

        state.aiAvailable = data.available;

        if (data.available) {
            elements.aiStatus.textContent = 'Ready';
            elements.aiStatus.className = 'ai-status ready';
        } else {
            elements.aiStatus.textContent = 'Unavailable';
            elements.aiStatus.className = 'ai-status unavailable';
            elements.aiStatus.title = data.message;
        }
    } catch (error) {
        console.error('Failed to check AI status:', error);
        elements.aiStatus.textContent = 'Error';
        elements.aiStatus.className = 'ai-status unavailable';
    }
}

// Setup AI event listeners
function setupAIEventListeners() {
    // Toggle AI panel
    elements.aiToggle.addEventListener('click', () => {
        elements.aiPanel.classList.toggle('collapsed');
    });

    // AI action buttons
    document.querySelectorAll('.ai-action-btn').forEach(btn => {
        btn.addEventListener('click', () => handleAIAction(btn.dataset.action));
    });

    // Custom prompt send
    elements.aiCustomSend.addEventListener('click', () => {
        const prompt = elements.aiCustomPrompt.value.trim();
        if (prompt) {
            sendAIRequest('custom', prompt);
        }
    });

    // Apply AI suggestion
    elements.aiApply.addEventListener('click', applyAISuggestion);

    // Copy AI response
    elements.aiCopy.addEventListener('click', copyAIResponse);
}

// Handle AI action button click
function handleAIAction(action) {
    if (!state.aiAvailable) {
        alert('AI is not available. Please set ANTHROPIC_API_KEY environment variable.');
        return;
    }

    // Toggle custom input visibility
    if (action === 'custom') {
        elements.aiCustomInput.classList.toggle('hidden');
        return;
    }

    // Get selected text or current file content
    const editor = elements.editor;
    const selectedText = editor.value.substring(editor.selectionStart, editor.selectionEnd);
    const content = selectedText || editor.value;

    if (!content.trim()) {
        elements.aiResponse.innerHTML = '<div class="ai-response-placeholder">請先選取要分析的文字，或開啟一個檔案</div>';
        return;
    }

    sendAIRequest(action, null, content);
}

// Send request to AI endpoint (with streaming)
async function sendAIRequest(action, customPrompt = null, content = null) {
    const editor = elements.editor;
    const selectedText = editor.value.substring(editor.selectionStart, editor.selectionEnd);
    const textContent = content || selectedText || editor.value;

    if (!textContent.trim()) {
        elements.aiResponse.innerHTML = '<div class="ai-response-placeholder">請先選取要分析的文字</div>';
        return;
    }

    // Show loading state
    elements.aiResponse.innerHTML = '';
    elements.aiResponse.classList.add('loading');
    elements.aiResponseActions.classList.add('hidden');
    state.aiResponse = '';

    // Disable action buttons during request
    document.querySelectorAll('.ai-action-btn').forEach(btn => btn.disabled = true);

    try {
        const response = await fetch('/api/ai/assist/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: textContent,
                action: action,
                context: state.currentFile ? `File: ${state.currentFile}` : null,
                custom_prompt: customPrompt
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Process SSE stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));

                        if (data.text) {
                            state.aiResponse += data.text;
                            elements.aiResponse.textContent = state.aiResponse;
                            elements.aiResponse.scrollTop = elements.aiResponse.scrollHeight;
                        }

                        if (data.done) {
                            console.log('AI response complete');
                        }

                        if (data.error) {
                            throw new Error(data.error);
                        }
                    } catch (e) {
                        // Ignore JSON parse errors for incomplete chunks
                        if (e.message !== 'Unexpected end of JSON input') {
                            console.error('SSE parse error:', e);
                        }
                    }
                }
            }
        }

        // Show response actions if we got a response
        if (state.aiResponse) {
            elements.aiResponseActions.classList.remove('hidden');
        }

    } catch (error) {
        console.error('AI request failed:', error);
        elements.aiResponse.textContent = `Error: ${error.message}`;
        state.aiResponse = '';
    } finally {
        elements.aiResponse.classList.remove('loading');
        document.querySelectorAll('.ai-action-btn').forEach(btn => btn.disabled = false);
    }
}

// Apply AI suggestion to editor
function applyAISuggestion() {
    if (!state.aiResponse) return;

    const editor = elements.editor;
    const selectedText = editor.value.substring(editor.selectionStart, editor.selectionEnd);

    if (selectedText) {
        // Replace selected text with AI response
        const before = editor.value.substring(0, editor.selectionStart);
        const after = editor.value.substring(editor.selectionEnd);
        editor.value = before + state.aiResponse + after;
    } else {
        // Append to end of file
        editor.value += '\n\n---\n\n## AI 建議\n\n' + state.aiResponse;
    }

    state.isDirty = true;
    elements.btnSave.disabled = false;

    // Update mindmap
    updateMindmap();
}

// Copy AI response to clipboard
async function copyAIResponse() {
    if (!state.aiResponse) return;

    try {
        await navigator.clipboard.writeText(state.aiResponse);
        elements.aiCopy.textContent = '✓ Copied';
        setTimeout(() => {
            elements.aiCopy.textContent = '複製';
        }, 2000);
    } catch (error) {
        console.error('Failed to copy:', error);
        alert('複製失敗');
    }
}

// --- Theme Functions ---

// Get node color based on current theme
function getNodeColor(node) {
    const palette = state.isDarkTheme ? colorPalettes.dark : colorPalettes.light;
    return palette[node.state.depth % palette.length];
}

// Apply theme to the ENTIRE page (not just mindmap)
function applyTheme(isDark) {
    state.isDarkTheme = isDark;

    // Apply theme class to body for full-page theming
    // CSS handles icon visibility via .light-theme .icon-sun/moon selectors
    if (isDark) {
        document.body.classList.remove('light-theme');
    } else {
        document.body.classList.add('light-theme');
    }

    // Save preference
    localStorage.setItem('mindmap-theme', isDark ? 'dark' : 'light');

    // Re-render mindmap with new colors if already initialized
    if (state.markmap && state.allMarkdown) {
        updateMindmap();
    }
}

// Setup theme toggle event listener
function setupThemeToggle() {
    const btnThemeToggle = document.getElementById('btn-theme-toggle');
    elements.btnThemeToggle = btnThemeToggle;

    if (btnThemeToggle) {
        btnThemeToggle.onclick = function() {
            applyTheme(!state.isDarkTheme);
        };
    }
}

// --- Fullscreen Functions ---

// Toggle fullscreen mode for mindmap pane
function toggleFullscreen() {
    const mindmapPane = elements.mindmapPane || document.getElementById('mindmap-pane');
    state.isFullscreen = !state.isFullscreen;

    // CSS handles icon visibility via .fullscreen .icon-expand/collapse selectors
    if (state.isFullscreen) {
        mindmapPane.classList.add('fullscreen');
    } else {
        mindmapPane.classList.remove('fullscreen');
    }

    // Refit mindmap after layout change
    setTimeout(() => {
        state.markmap?.fit();
    }, 100);
}

// Setup fullscreen toggle
function setupFullscreenToggle() {
    const btnFullscreen = document.getElementById('btn-fullscreen');
    elements.btnFullscreen = btnFullscreen;

    if (btnFullscreen) {
        btnFullscreen.onclick = toggleFullscreen;
    }

    // ESC key to exit fullscreen
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && state.isFullscreen) {
            toggleFullscreen();
        }
    });
}

// --- Agent Chat Functions ---

// Agent state
const agentState = {
    available: false,
    isLoading: false,
    messages: []
};

// Agent elements cache
const agentElements = {};

// Check agent availability
async function checkAgentStatus() {
    agentElements.panel = document.getElementById('agent-panel');
    agentElements.status = document.getElementById('agent-status');
    agentElements.toggle = document.getElementById('agent-toggle');
    agentElements.messages = document.getElementById('agent-messages');
    agentElements.input = document.getElementById('agent-input');
    agentElements.sendBtn = document.getElementById('agent-send');

    try {
        const response = await fetch('/api/agent/status');
        const data = await response.json();
        agentState.available = data.available;

        if (data.available) {
            agentElements.status.textContent = 'Ready';
            agentElements.status.className = 'agent-status ready';
        } else {
            agentElements.status.textContent = 'Unavailable';
            agentElements.status.className = 'agent-status unavailable';
            agentElements.status.title = data.message;
        }
    } catch (error) {
        console.error('Failed to check agent status:', error);
        agentElements.status.textContent = 'Error';
        agentElements.status.className = 'agent-status unavailable';
    }
}

// Setup agent event listeners
function setupAgentEventListeners() {
    // Toggle panel
    agentElements.toggle.onclick = () => {
        agentElements.panel.classList.toggle('collapsed');
    };

    // Also toggle on header click
    const header = agentElements.panel.querySelector('.agent-panel-header');
    header.onclick = (e) => {
        if (e.target !== agentElements.toggle) {
            agentElements.panel.classList.toggle('collapsed');
        }
    };

    // Send message on button click
    agentElements.sendBtn.onclick = sendAgentMessage;

    // Send message on Enter (Shift+Enter for newline)
    agentElements.input.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendAgentMessage();
        }
    };

    // Auto-resize textarea
    agentElements.input.oninput = () => {
        agentElements.input.style.height = 'auto';
        agentElements.input.style.height = Math.min(agentElements.input.scrollHeight, 100) + 'px';
    };
}

// Send message to agent
async function sendAgentMessage() {
    const message = agentElements.input.value.trim();
    if (!message || agentState.isLoading || !agentState.available) return;

    // Clear welcome message on first send
    const welcome = agentElements.messages.querySelector('.agent-welcome');
    if (welcome) welcome.remove();

    // Add user message
    addAgentMessage(message, 'user');
    agentElements.input.value = '';
    agentElements.input.style.height = 'auto';

    // Show loading state
    agentState.isLoading = true;
    agentElements.sendBtn.disabled = true;
    const typingDiv = document.createElement('div');
    typingDiv.className = 'agent-typing';
    typingDiv.textContent = 'Thinking';
    agentElements.messages.appendChild(typingDiv);
    scrollAgentToBottom();

    try {
        const response = await fetch('/api/agent/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
        });

        // Remove typing indicator
        typingDiv.remove();

        // Process SSE stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let assistantMessage = '';
        let assistantDiv = null;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));

                        if (data.error) {
                            addAgentMessage(`Error: ${data.error}`, 'error');
                        } else if (data.type === 'text') {
                            if (!assistantDiv) {
                                assistantDiv = document.createElement('div');
                                assistantDiv.className = 'agent-message assistant';
                                agentElements.messages.appendChild(assistantDiv);
                            }
                            assistantMessage += data.content;
                            assistantDiv.textContent = assistantMessage;
                            scrollAgentToBottom();
                        } else if (data.type === 'tool_use') {
                            addAgentMessage(`Using tool: ${data.tool}`, 'tool');
                        } else if (data.done) {
                            // Stream complete
                        }
                    } catch (e) {
                        // Ignore parse errors for incomplete chunks
                    }
                }
            }
        }
    } catch (error) {
        typingDiv.remove();
        addAgentMessage(`Failed to send message: ${error.message}`, 'error');
    } finally {
        agentState.isLoading = false;
        agentElements.sendBtn.disabled = false;
    }
}

// Add message to chat
function addAgentMessage(content, type) {
    const div = document.createElement('div');
    div.className = `agent-message ${type}`;
    div.textContent = content;
    agentElements.messages.appendChild(div);
    scrollAgentToBottom();
}

// Scroll chat to bottom
function scrollAgentToBottom() {
    agentElements.messages.scrollTop = agentElements.messages.scrollHeight;
}

// Start the app
document.addEventListener('DOMContentLoaded', init);

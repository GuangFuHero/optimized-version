# 光復超人 2.0 - Development Roadmap

## Phase 1: Markdown as Single Source of Truth ✅

**Goal**: Use MD + file system as single source of truth, so any AI agent can easily work with these specs, and edits are clear in git diff.

**Completed**:
- [x] Convert Whimsical mindmap to Markdown structure
- [x] 6 modules with requirements.md and overview.md
- [x] Export script to generate interactive mindmap (Markmap)
- [x] Export script to generate PDF spec document

**Evaluation Needed**:
- [x] Verify the exported mindmap contains the same structural info as source PNG
- [x] Ensure 4 dimensions (UI/UX, Frontend, Backend, AI & Data) are preserved
- [ ] Ensure all FR-XXX items are captured

---

## Phase 2: Frontend Mindmap Editor (Planned)

**Goal**: Create a frontend app that renders the local MD files as an interactive mindmap, allowing non-tech people to edit through UI.

**Features**:
- Local dev server at `localhost:3000`
- Read MD files from `mindmap/` directory
- Render as interactive mindmap (similar to Markmap)
- Enable editing nodes directly in UI
- Save changes back to MD files
- Real-time preview of changes

**Tech Stack Options**:
- React + Vite for frontend
- Express/Fastify for local file system access
- Markmap library for rendering
- Monaco Editor for inline MD editing

**User Stories**:
1. Non-tech PM can open browser, see mindmap, click to edit nodes
2. User can add/remove FR items through UI
3. Changes auto-save to MD files, visible in git diff
4. Option to "Ask AI to modify" - sends request to AI agent

---

## Phase 3: Claude Agent SDK Integration (Planned)

**Goal**: Add programmatic AI agent support using Claude Agent SDK, enabling automated spec modifications.

**Features**:
- Integrate Claude Agent SDK (claude-code backend, programmatic control)
- API endpoint for "AI-assisted editing"
- User describes change in natural language → AI modifies MD files
- Review changes before committing

**Research Needed**:
- Claude Agent SDK documentation and setup
- How to run claude-code programmatically (not CLI interaction)
- Security considerations for file system access

**User Stories**:
1. User clicks "Ask AI" button in UI
2. Types: "Add a new requirement for user authentication"
3. AI agent modifies the appropriate MD file
4. User reviews diff in UI before accepting

---

## Future Ideas

- [ ] Collaborative editing (multiple users)
- [ ] Version history viewer in UI
- [ ] Export to other formats (Notion, Confluence, etc.)
- [ ] Webhook for CI/CD integration
- [ ] Mobile-friendly view

# Mindmap Directory Structure

This directory contains the mindmap specification in a hierarchical directory-tree structure that mirrors the actual mindmap hierarchy.

## Directory Structure

```
mindmap/
├── 01_map/                          # Module 1: Map
│   ├── content.md                   # User Stories (from Whimsical mindmap)
│   └── requirements/
│       ├── content.md               # FR list (FR-MAP-01, FR-MAP-02, ...)
│       ├── ui_ux/
│       │   └── content.md           # UI/UX specifications for this module
│       ├── frontend/
│       │   └── content.md           # Frontend specifications
│       ├── backend/
│       │   ├── content.md           # Backend specifications
│       │   └── specs/               # SPEC links for backend (when applicable)
│       │       └── content.md
│       └── ai_data/
│           └── content.md           # AI & Data specifications
├── 02_volunteer_tasks/              # Module 2: Volunteer Tasks
│   └── ... (same structure)
├── 03_delivery/                     # Module 3: Delivery
│   └── ... (same structure)
├── 04_info_page/                    # Module 4: Info Page
│   └── ... (same structure)
├── 05_moderator_admin/              # Module 5: Moderator Admin
│   └── ... (same structure)
└── 06_system_admin/                 # Module 6: System Admin
    └── ... (same structure)
```

## Hierarchy Levels

The directory structure follows the 4-layer mindmap hierarchy:

1. **Layer 1: Module (User Story)**
   - Directory: `{module_id}/`
   - File: `content.md` (contains module name/description)
   - Example: `01_map/content.md` → "地圖站點 Map"

2. **Layer 2: Functional Requirements**
   - Directory: `{module_id}/requirements/`
   - File: `content.md` (contains FR list)
   - Example: `01_map/requirements/content.md` → FR-MAP-01, FR-MAP-02, ...

3. **Layer 3: Dimensions (Delegates)**
   - Directory: `{module_id}/requirements/{dimension}/`
   - Dimensions: `ui_ux/`, `frontend/`, `backend/`, `ai_data/`
   - File: `content.md` (contains dimension-specific specifications)
   - Example: `01_map/requirements/backend/content.md` → Backend specs for all FR-MAP items

4. **Layer 4: SPEC Links (Optional)**
   - Directory: `{module_id}/requirements/{dimension}/specs/`
   - File: `content.md` (contains SPEC links)
   - Example: `01_map/requirements/backend/specs/content.md` → S01-request-management

## Content Format

All `content.md` files contain plain text (not formatted markdown):

- Module-level `content.md`: Module name/description
- Requirements-level `content.md`: FR list (one per line)
- Dimension-level `content.md`: FR items with bullet points
- Specs-level `content.md`: SPEC links and references

## Module Mapping

| Old Name (docs/)       | New Name (mindmap/)   |
|------------------------|-----------------------|
| 01-map                 | 01_map                |
| 02-volunteer-tasks     | 02_volunteer_tasks    |
| 03-delivery            | 03_delivery           |
| 04-info-page           | 04_info_page          |
| 05-moderator-admin     | 05_moderator_admin    |
| 06-system-admin        | 06_system_admin       |

## Dimension Mapping

| Markdown Heading | Directory Name |
|------------------|----------------|
| UI/UX            | ui_ux          |
| Frontend         | frontend       |
| Backend          | backend        |
| AI & Data        | ai_data        |

## Migration

The structure was migrated from `docs/` flat markdown files using:

```bash
python scripts/migrate_to_mindmap.py
```

## Benefits of Directory Structure

1. **Mirrors mindmap hierarchy**: Each level in the directory tree corresponds to a level in the mindmap
2. **Easier navigation**: Can browse specifications by module → FR → dimension
3. **Better separation**: Each dimension's specs are in separate files
4. **Scalable**: Easy to add new modules, FRs, or dimensions
5. **Editor-friendly**: Can build a tree-view editor that reflects the directory structure

## Original Source

- Source mindmap: `source_mindmap_6829x7999.png` (from Whimsical)

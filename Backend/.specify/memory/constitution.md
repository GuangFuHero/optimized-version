<!--
═══════════════════════════════════════════════════════════════════════════
SYNC IMPACT REPORT
═══════════════════════════════════════════════════════════════════════════
Version Change: [INITIAL] → 1.0.0
Constitution Type: MINOR (initial creation with comprehensive principles)

Modified Principles:
  - Created: I. Rapid Deployment Readiness (NEW)
  - Created: II. Disaster-First Design (NEW)
  - Created: III. Maintainability & Documentation (NEW)
  - Created: IV. Flexibility & Adaptability (NEW)
  - Created: V. Progressive Enhancement (NEW)

Added Sections:
  - Core Principles (5 principles total)
  - Technology Constraints
  - Development Standards
  - Governance

Templates Requiring Updates:
  ✅ .specify/templates/plan-template.md (constitution check section updated)
  ✅ .specify/templates/spec-template.md (aligned with disaster relief scenarios)
  ✅ .specify/templates/tasks-template.md (aligned with rapid deployment tasks)
  ✅ README.md (project description confirmed)

Follow-up TODOs:
  - None - all placeholders filled with concrete values

Rationale:
  This is the initial constitution (v1.0.0) for the optimized disaster relief
  platform. Principles are designed around the core mission: rapid deployment,
  disaster adaptability, maintainability, and flexibility. All principles are
  actionable and testable.
═══════════════════════════════════════════════════════════════════════════
-->

# 光復救災平台 Constitution
<!-- Guangfu Disaster Relief Platform Constitution -->

## Core Principles

### I. Rapid Deployment Readiness

**MUST achieve "Code to Production" in under 4 hours** for experienced engineers during disaster response:
- All dependencies MUST be containerized or documented with explicit version pins
- Infrastructure setup MUST be automated via single-command deployment (e.g., `docker-compose up` or equivalent)
- Configuration MUST use environment variables with sensible defaults and example `.env.example` file
- Database migrations MUST be automatic and idempotent
- Zero manual infrastructure steps required after initial setup

**Rationale**: In disaster scenarios, time is critical. The platform must be deployable by civil defense organizations, MODA (數位發展部), or volunteer engineers within hours, not days. Manual setup steps increase failure risk and delay life-saving operations.

---

### II. Disaster-First Design

**System MUST remain functional under degraded network and infrastructure conditions**:
- Progressive enhancement: Core features MUST work with JavaScript disabled or slow networks (HTML-first approach)
- Offline capability: Maps, resource lists, and contact info MUST cache locally when possible
- Graceful degradation: When services fail (e.g., geocoding API down), display raw data rather than error screens
- Mobile-first responsive design: MUST work on smartphones (most common device in disaster zones)
- Low-bandwidth optimization: Images compressed, minimize external dependencies, lazy-load non-critical assets

**MUST support Taiwan-specific disaster scenarios**:
- Earthquakes (地震): Real-time seismic data integration readiness
- Typhoons (颱風): Weather alert integration, evacuation route mapping
- Floods (水災): Water level monitoring, shelter location tracking
- Landslides (土石流): Hazard zone visualization on maps

**Rationale**: Disaster zones have unreliable internet, damaged infrastructure, and stressed networks. The platform cannot assume stable conditions. Taiwan faces unique natural disasters requiring specialized features.

---

### III. Maintainability & Documentation

**All code MUST be maintainable by engineers unfamiliar with the codebase within 2 hours**:
- README MUST include: Quick start (< 5 steps), architecture overview, deployment instructions, troubleshooting guide
- Code comments MUST explain "why", not "what" (self-documenting code preferred)
- Critical paths (authentication, data sync, map rendering) MUST have inline documentation
- Configuration files MUST include comments explaining each option
- Database schema MUST be documented with entity-relationship diagrams or inline comments

**Chinese-English bilingual support**:
- UI text MUST support Traditional Chinese (繁體中文) as primary language
- Code comments and documentation MAY be in English (preferred for international collaboration) or Chinese
- Variable/function names MUST be in English (standard programming convention)

**Rationale**: During disasters, the original developers may be unavailable. Any competent engineer must be able to understand, modify, and deploy the system quickly. Bilingual support ensures accessibility for Taiwan's civil defense organizations and international volunteers.

---

### IV. Flexibility & Adaptability

**Platform MUST be adaptable to different disaster types without major code changes**:
- Feature flags or configuration files MUST control which modules are active (e.g., enable/disable volunteer matching, supply tracking, map layers)
- Data schemas MUST use flexible JSON fields for disaster-specific attributes (avoid rigid relational structures for variable data)
- Map layers MUST be configurable (swap base maps, add custom GeoJSON layers without code changes)
- UI components MUST be modular (e.g., hide/show tabs via config, not hardcoded)

**No vendor lock-in**:
- MUST NOT depend on proprietary services that require paid subscriptions for core functionality
- Prefer open-source libraries and self-hostable services (e.g., OpenStreetMap over Google Maps API)
- If commercial services used (e.g., geocoding), MUST provide open-source fallback options

**Rationale**: Every disaster is unique. A typhoon response differs from an earthquake response. The platform must adapt via configuration, not code rewrites. Vendor lock-in risks service unavailability during critical moments.

---

### V. Progressive Enhancement

**Feature development MUST follow incremental delivery**:
1. **Phase 1 - MVP (Minimum Viable Product)**: Core disaster relief workflow operational
   - Map with shelter/resource locations
   - Basic information aggregation (news, alerts)
   - Contact information for response teams
2. **Phase 2 - Enhanced Features**: Supply tracking, volunteer matching (if required)
3. **Phase 3 - Advanced Features**: Real-time updates, mobile apps, analytics

**Test-driven for critical paths ONLY**:
- Core features (map rendering, data display, contact forms) MUST have integration tests
- Edge features MAY skip tests if time-constrained (disaster response prioritizes speed over perfection)
- No test should block deployment if manual verification confirms functionality

**Rationale**: Disasters are unpredictable. An 80% complete platform deployed today saves more lives than a 100% perfect platform deployed next week. Tests ensure reliability but must not become bureaucratic barriers.

---

## Technology Constraints

**MUST use open-source, widely-supported technologies**:
- **Backend**: Python (Flask/FastAPI), Node.js (Express), or Go (avoid niche frameworks)
- **Frontend**: HTML/CSS/JavaScript with optional React/Vue (progressive enhancement required)
- **Database**: PostgreSQL (with PostGIS for geospatial) or SQLite (for simpler deployments)
- **Maps**: OpenStreetMap (Leaflet.js) or self-hosted tile servers
- **Deployment**: Docker + Docker Compose (must run on any Linux server)

**Avoid**:
- Cutting-edge frameworks requiring frequent updates (stability over novelty)
- Cloud-only services (must be self-hostable)
- Technologies with small communities (harder to find volunteers)

**Rationale**: Common technologies ensure volunteer engineers can contribute immediately. Self-hosting prevents dependency on external services that may fail during disasters.

---

## Development Standards

**Code Quality (Pragmatic, not Dogmatic)**:
- Linting MUST pass (automated via pre-commit hooks or CI)
- Security vulnerabilities (OWASP Top 10) MUST be addressed before deployment
- Performance: Page load < 3 seconds on 3G networks (measured via Lighthouse or similar)
- Accessibility: WCAG 2.1 Level A compliance (basic keyboard navigation, alt text on images)

**Version Control & Branching**:
- `main` branch MUST always be deployable (passing tests, no known critical bugs)
- Feature branches for new functionality, merged via pull request
- Hotfix branches for emergency patches during active disaster response

**Security**:
- Sensitive data (API keys, database passwords) MUST use environment variables, never committed to version control
- User authentication required for admin features (adding/editing resources), but public read access for disaster info
- SQL injection, XSS, CSRF protections MUST be implemented (use framework defaults, avoid raw queries)

**Rationale**: Standards ensure consistent quality and prevent catastrophic failures. However, pragmatism allows bypassing non-critical issues during active disaster response.

---

## Governance

**Constitution Authority**:
- This constitution supersedes all other development practices
- Violations MUST be justified in writing (e.g., "Emergency hotfix bypassing tests because X")
- All pull requests MUST verify compliance with principles (checklist in PR template)

**Amendment Process**:
1. Propose amendment with rationale (GitHub issue or discussion)
2. Review by core maintainers (minimum 2 approvers for changes)
3. Update constitution document + increment version (semantic versioning)
4. Update all dependent templates (plan, spec, tasks) to reflect changes
5. Document migration plan if amendment breaks existing workflows

**Versioning Policy**:
- **MAJOR** (X.0.0): Backward-incompatible changes (e.g., removing a principle, changing deployment model)
- **MINOR** (1.X.0): New principles or expanded guidance (backward-compatible additions)
- **PATCH** (1.0.X): Clarifications, typo fixes, wording improvements (no semantic change)

**Compliance Review**:
- Constitution check MUST pass before Phase 0 research in implementation plans
- Re-check after Phase 1 design to ensure alignment with principles
- Violations documented in `Complexity Tracking` section of plan.md with justification

**Runtime Guidance**:
- For day-to-day development questions not covered here, refer to `README.md` quickstart and troubleshooting sections
- For disaster-specific workflows (e.g., "how to add a new disaster type"), create runbooks in `docs/` directory

---

**Version**: 1.0.0 | **Ratified**: 2025-11-23 | **Last Amended**: 2025-11-23

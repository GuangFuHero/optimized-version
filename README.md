# 光復救災平台 (Guangfu Disaster Relief Platform)

**English**: An optimized disaster relief platform designed for rapid deployment during Taiwan's natural disasters. Based on the Guangfu Superman (花蓮光復救災網站) foundation, this platform provides integrated resource management, supply distribution matching, volunteer coordination, and real-time mapping for civil defense organizations, MODA (數位發展部/Ministry of Digital Affairs), and volunteer engineers.

**中文**: 基於光復超人（花蓮光復救災網站）基礎上的優化版救災整合資源平台。定位為「開箱即用」的快速上線系統，適用於台灣多種天災的第一階段應急需求，包含地圖、資訊統整分頁、物資配送媒合、志工媒合等功能，供未來民防組織、數位發展部及工程師進行演練及實際災難應用。

## Core Mission

**好維護 (Maintainable)** • **開箱即用 (Ready-to-Deploy)** • **彈性大 (Flexible)** • **適合多種災難 (Multi-Disaster)**

- ⚡ **Rapid Deployment**: From code to production in under 4 hours
- 🌐 **Disaster-First**: Works offline, mobile-first, gracefully degrades under poor network
- 🔧 **Maintainable**: Any engineer can understand and deploy within 2 hours
- 🎯 **Flexible**: Adapts to earthquakes, typhoons, floods, and landslides via configuration
- 🚀 **Progressive**: MVP-first approach - deploy 80% today, perfect it later

## Quick Start

> **Constitution**: This project follows strict design principles documented in [`.specify/memory/constitution.md`](.specify/memory/constitution.md). All development must comply with these principles.

```bash
# Prerequisites: Docker, Docker Compose

# 1. Clone and configure
git clone <repository-url>
cd optimized-version
cp .env.example .env  # Edit with your settings

# 2. Deploy (single command)
docker-compose up -d

# 3. Access platform
open http://localhost:3000
```

For detailed setup instructions, see the implementation plan in `specs/` directory.

## Project Status

🚧 **Under Development** - Constitution v1.0.0 established (2025-11-23)

This repository contains the foundational architecture and templates for systematic feature development. Active features will be documented in `specs/` as they are planned and implemented.

## Documentation

- **Constitution**: [`.specify/memory/constitution.md`](.specify/memory/constitution.md) - Core principles and governance
- **Templates**: `.specify/templates/` - Specification, planning, and task templates
- **Specs**: `specs/` - Feature specifications and implementation plans (created on-demand)

## Technology Stack

Following constitution principles (open-source, widely-supported, self-hostable):

- **Backend**: TBD (Python/FastAPI or Node.js/Express)
- **Frontend**: TBD (HTML/CSS/JS with optional React/Vue)
- **Database**: PostgreSQL with PostGIS (geospatial support)
- **Maps**: OpenStreetMap (Leaflet.js)
- **Deployment**: Docker + Docker Compose

## Contributing

1. Read the [Constitution](.specify/memory/constitution.md) - Non-negotiable principles
2. Follow the feature development workflow:
   - `/speckit.specify` - Create feature specification
   - `/speckit.plan` - Generate implementation plan
   - `/speckit.tasks` - Break down into actionable tasks
   - `/speckit.implement` - Execute implementation
3. Ensure all PRs pass constitution compliance checks

## License

[View License](LICENSE)

## Contact

For disaster response coordination or technical questions, please refer to the contact information in the deployment documentation.

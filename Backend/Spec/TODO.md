# Project TODO - Disaster Relief Platform (救災平台專案待辦事項)

**Last Updated**: 2025-11-23
**Project Status**: Planning & Specification Phase

---

## ✅ Completed Tasks

### Phase 1: Feature 002 Enhancement & Feature Planning (2025-11-23)

- [x] 分析并分类30+个新user stories
- [x] 将6个地图相关的user stories整合到Feature 002
- [x] 为Feature 002添加6个新User Stories (US-8 到 US-13)
- [x] 为新user stories添加33个功能需求 (FR-047 到 FR-079)
- [x] 更新Feature 002的Key Entities（新增4个实体）
- [x] 创建Feature 003-007的大纲规格文档

---

## 🔄 In Progress

### Current Focus: None (waiting for next phase)

---

## 📋 Pending Tasks

### Phase 2: Complete Feature Specifications (按优先级排序)

#### High Priority (P1)

- [ ] **Feature 003: Request Management System** - 需求单管理系统
  - [ ] 运行 `/speckit.specify` 扩展为完整规格
  - [ ] 完成所有必需章节：User Scenarios, Requirements, Success Criteria, Assumptions
  - [ ] 与利害关系人确认工作流程
  - [ ] 运行 `/speckit.plan` 生成实施计划
  - [ ] 运行 `/speckit.tasks` 生成任务分解
  - 📌 **Why Priority**: 是其他功能的基础，志工和物资系统都依赖此功能

- [ ] **Feature 004: Volunteer Dispatch System** - 志工调度系统
  - [ ] 运行 `/speckit.specify` 扩展为完整规格
  - [ ] 定义志工技能分类体系
  - [ ] 设计志工匹配算法规格
  - [ ] 运行 `/speckit.plan` 生成实施计划
  - [ ] 运行 `/speckit.tasks` 生成任务分解
  - 📌 **Why Priority**: 依赖Feature 003，是救灾行动的执行层

#### Medium Priority (P2)

- [ ] **Feature 005: Supply Management System** - 资源管理系统
  - [ ] 运行 `/speckit.specify` 扩展为完整规格
  - [ ] 定义物资分类标准
  - [ ] 设计库存追踪数据库架构
  - [ ] 运行 `/speckit.plan` 生成实施计划
  - [ ] 运行 `/speckit.tasks` 生成任务分解

- [ ] **Feature 006: Backend Administration System** - 后台管理系统
  - [ ] 运行 `/speckit.specify` 扩展为完整规格
  - [ ] 设计RBAC权限系统架构
  - [ ] 定义审计日志查询需求
  - [ ] 设计统计仪表板指标库
  - [ ] 运行 `/speckit.plan` 生成实施计划
  - [ ] 运行 `/speckit.tasks` 生成任务分解

#### Lower Priority (P3)

- [ ] **Feature 007: Information Publishing System** - 资讯发布系统
  - [ ] 运行 `/speckit.specify` 扩展为完整规格
  - [ ] 设计内容管理工作流
  - [ ] 规划媒体资产存储策略
  - [ ] 运行 `/speckit.plan` 生成实施计划
  - [ ] 运行 `/speckit.tasks` 生成任务分解

---

### Phase 3: Implementation Planning

- [ ] 确定技术栈和架构决策
  - [ ] 选择前端框架（React/Vue/Angular）
  - [ ] 选择后端框架（Node.js/Python/Java）
  - [ ] 选择数据库（PostgreSQL + PostGIS for地理数据）
  - [ ] 选择地图库（Leaflet/Mapbox/OpenLayers）
  - [ ] 确定部署策略（云服务/自托管）

- [ ] 设计系统架构
  - [ ] 绘制系统架构图
  - [ ] 定义API接口规范
  - [ ] 设计数据库ER图
  - [ ] 规划微服务边界（如果采用微服务架构）

- [ ] 准备开发环境
  - [ ] 配置开发工具和IDE
  - [ ] 建立Git工作流和分支策略
  - [ ] 配置CI/CD流水线
  - [ ] 建立测试环境

---

### Phase 4: Development Execution (待Phase 3完成后规划)

按Feature优先级依次开发：
1. Feature 002 (Map) - 基础设施
2. Feature 003 (Requests) - 核心功能
3. Feature 004 (Volunteers) - 执行层
4. Feature 005 (Supplies) - 资源层
5. Feature 006 (Admin) - 管理层
6. Feature 007 (Publishing) - 沟通层

---

## 📊 Feature Status Overview

| Feature | Status | Spec Complete | Plan Complete | Tasks Defined | Implementation |
|---------|--------|---------------|---------------|---------------|----------------|
| 002 - Interactive Map | ✅ Enhanced | ✅ Yes | ⏳ Pending | ⏳ Pending | ⏳ Not Started |
| 003 - Request Management | 📄 Outlined | ⏳ Pending | ⏳ Pending | ⏳ Pending | ⏳ Not Started |
| 004 - Volunteer Dispatch | 📄 Outlined | ⏳ Pending | ⏳ Pending | ⏳ Pending | ⏳ Not Started |
| 005 - Supply Management | 📄 Outlined | ⏳ Pending | ⏳ Pending | ⏳ Pending | ⏳ Not Started |
| 006 - Backend Admin | 📄 Outlined | ⏳ Pending | ⏳ Pending | ⏳ Pending | ⏳ Not Started |
| 007 - Info Publishing | 📄 Outlined | ⏳ Pending | ⏳ Pending | ⏳ Pending | ⏳ Not Started |

**Legend**: ✅ Complete | 🔄 In Progress | ⏳ Pending | 📄 Outline Only | ⏳ Not Started

---

## 🎯 Immediate Next Actions (建议优先进行)

1. **Review Feature 002 Updated Spec** - 检查更新后的Feature 002规格是否完整准确
2. **Start Feature 003 Specification** - 开始完善Feature 003的完整规格
   ```bash
   /speckit.specify 003-request-management
   ```
3. **Stakeholder Consultation** - 与救灾协调员和志工团体讨论工作流程需求

---

## 📝 Notes & Decisions

### 2025-11-23: Feature Organization Decision
- **Decision**: 将30+个user stories分拆为多个独立Features，但将地图直接相关的功能保留在Feature 002
- **Rationale**:
  - 保持Feature 002聚焦在地图展示和基础交互
  - 其他系统（需求单、志工、物资、后台、资讯）拆分为独立Features便于开发和维护
  - 6个与地图强相关的stories（资源点位管理、搜寻、地图层、禁区、路况、配送路线展示）整合到Feature 002
- **Impact**:
  - Feature 002 从7个user stories扩展到13个
  - 新增33个功能需求 (FR-047 到 FR-079)
  - 新增4个实体定义

### 2025-11-23: Clarifications Integrated
整合了8个重要决策到Feature 002：
1. 冲突解决策略：Last-edit-wins with viewable history
2. 多功能标记：单一位置可有多个类别标签
3. 白名单类别创建：仅白名单用户可创建新类别
4. 导航范围：不包含内建导航，仅展示信息
5. 禁区可见性：始终可见，不受聚类或过滤影响
6. 推送通知：不提供主动推送，仅拉取模式
7. 配置UI：需要全面的管理配置界面
8. LINE 2FA认证：志工认证使用LINE双因素认证

---

## 🔗 Related Documents

- [Project Constitution](../.specify/constitution.md) - 项目宪章和核心原则
- [Feature 002 Spec](./002-interactive-disaster-map/spec.md) - 交互式救灾地图规格（已更新）
- [Feature 003 Outline](./003-request-management/spec.md) - 需求单管理系统大纲
- [Feature 004 Outline](./004-volunteer-dispatch/spec.md) - 志工调度系统大纲
- [Feature 005 Outline](./005-supply-management/spec.md) - 资源管理系统大纲
- [Feature 006 Outline](./006-backend-administration/spec.md) - 后台管理系统大纲
- [Feature 007 Outline](./007-information-publishing/spec.md) - 资讯发布系统大纲

---

## 💡 Questions & Open Issues

### Technical Questions
- [ ] 地图瓦片服务器选择：OpenStreetMap还是自建？
- [ ] 实时更新机制：WebSocket还是轮询？
- [ ] 地理围栏库选择：Uber H3还是其他方案？
- [ ] 照片存储：本地存储还是云存储（S3/GCS）？

### Business Questions
- [ ] 志工认证流程详细步骤？需要哪些验证材料？
- [ ] 物资捐赠是否需要税务收据生成功能？
- [ ] 需求单分配算法的优先级权重如何确定？
- [ ] 灾害资讯发布需要哪些审核层级？

### UX Questions
- [ ] 移动优先还是桌面优先设计？
- [ ] 是否需要离线模式支持？
- [ ] 多语言支持优先级（初期仅繁体中文）？
- [ ] 无障碍访问（a11y）要求级别？

---

**Note**: 此文档应定期更新以反映项目进展。建议每完成一个主要milestone后更新状态。

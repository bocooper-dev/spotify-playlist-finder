# Implementation Plan: Spotify Playlist Discovery System

**Branch**: `002-build-an-ai` | **Date**: 2025-09-10 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-build-an-ai/spec.md`

## Execution Flow (/plan command scope)
```
1. Load feature spec from Input path
   → If not found: ERROR "No feature spec at {path}"
2. Fill Technical Context (scan for NEEDS CLARIFICATION)
   → Detect Project Type from context (web=frontend+backend, mobile=app+api)
   → Set Structure Decision based on project type
3. Evaluate Constitution Check section below
   → If violations exist: Document in Complexity Tracking
   → If no justification possible: ERROR "Simplify approach first"
   → Update Progress Tracking: Initial Constitution Check
4. Execute Phase 0 → research.md
   → If NEEDS CLARIFICATION remain: ERROR "Resolve unknowns"
5. Execute Phase 1 → contracts, data-model.md, quickstart.md, agent-specific template file (e.g., `CLAUDE.md` for Claude Code, `.github/copilot-instructions.md` for GitHub Copilot, or `GEMINI.md` for Gemini CLI).
6. Re-evaluate Constitution Check section
   → If new violations: Refactor design, return to Phase 1
   → Update Progress Tracking: Post-Design Constitution Check
7. Plan Phase 2 → Describe task generation approach (DO NOT create tasks.md)
8. STOP - Ready for /tasks command
```

**IMPORTANT**: The /plan command STOPS at step 7. Phases 2-4 are executed by other commands:
- Phase 2: /tasks command creates tasks.md
- Phase 3-4: Implementation execution (manual or via tools)

## Summary
Build a web application that discovers popular Spotify playlists across specified music genres, returning 50 playlists with URLs and owner contact information. The system uses Nuxt 4 with Nuxt UI Pro for the frontend, integrates with Spotify's API for playlist data, and supports export functionality in CSV and JSON formats.

## Technical Context
**Language/Version**: TypeScript 5.x / Node.js 20+  
**Primary Dependencies**: Nuxt 4, Nuxt UI Pro, Tailwind CSS, Spotify Web API SDK  
**Storage**: Browser localStorage for caching, server-side session storage  
**Testing**: Vitest for unit/integration tests, Playwright for E2E  
**Target Platform**: Vercel deployment, modern browsers (Chrome, Firefox, Safari, Edge)
**Project Type**: web - frontend+backend integrated in Nuxt
**Performance Goals**: <2 minutes search completion, <3s initial page load  
**Constraints**: Spotify API rate limits (varies by endpoint), 10 genres max per search  
**Scale/Scope**: Supporting concurrent users, caching to minimize API calls

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Simplicity**:
- Projects: 1 (Nuxt app with integrated frontend/backend)
- Using framework directly? Yes (Nuxt UI Pro components, no wrappers)
- Single data model? Yes (Playlist, Genre, SearchResult entities)
- Avoiding patterns? Yes (direct Spotify API integration, no unnecessary abstraction)

**Architecture**:
- EVERY feature as library? Planning spotify-client, export-utils, cache-manager
- Libraries listed: 
  - spotify-client: Spotify API integration & playlist discovery
  - export-utils: CSV/JSON export functionality
  - cache-manager: LocalStorage and session caching
- CLI per library: Each library will expose CLI for testing/debugging
- Library docs: llms.txt format will be included

**Testing (NON-NEGOTIABLE)**:
- RED-GREEN-Refactor cycle enforced? Yes
- Git commits show tests before implementation? Yes
- Order: Contract→Integration→E2E→Unit strictly followed? Yes
- Real dependencies used? Yes (real Spotify API in tests with test account)
- Integration tests for: new libraries, contract changes, shared schemas? Yes
- FORBIDDEN: Implementation before test, skipping RED phase - Understood

**Observability**:
- Structured logging included? Yes (server and client logs)
- Frontend logs → backend? Yes (error reporting to server)
- Error context sufficient? Yes (user actions, API responses, timing)

**Versioning**:
- Version number assigned? 1.0.0 initial
- BUILD increments on every change? Yes
- Breaking changes handled? N/A for initial version

## Project Structure

### Documentation (this feature)
```
specs/[###-feature]/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
```
# Option 1: Single project (DEFAULT)
src/
├── models/
├── services/
├── cli/
└── lib/

tests/
├── contract/
├── integration/
└── unit/

# Option 2: Web application (when "frontend" + "backend" detected)
backend/
├── src/
│   ├── models/
│   ├── services/
│   └── api/
└── tests/

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/
└── tests/

# Option 3: Mobile + API (when "iOS/Android" detected)
api/
└── [same as backend above]

ios/ or android/
└── [platform-specific structure]
```

**Structure Decision**: Option 2 (Web application) - Using Nuxt's integrated structure

## Phase 0: Outline & Research
1. **Extract unknowns from Technical Context** above:
   - For each NEEDS CLARIFICATION → research task
   - For each dependency → best practices task
   - For each integration → patterns task

2. **Generate and dispatch research agents**:
   ```
   For each unknown in Technical Context:
     Task: "Research {unknown} for {feature context}"
   For each technology choice:
     Task: "Find best practices for {tech} in {domain}"
   ```

3. **Consolidate findings** in `research.md` using format:
   - Decision: [what was chosen]
   - Rationale: [why chosen]
   - Alternatives considered: [what else evaluated]

**Output**: research.md with all NEEDS CLARIFICATION resolved

## Phase 1: Design & Contracts
*Prerequisites: research.md complete*

1. **Extract entities from feature spec** → `data-model.md`:
   - Entity name, fields, relationships
   - Validation rules from requirements
   - State transitions if applicable

2. **Generate API contracts** from functional requirements:
   - For each user action → endpoint
   - Use standard REST/GraphQL patterns
   - Output OpenAPI/GraphQL schema to `/contracts/`

3. **Generate contract tests** from contracts:
   - One test file per endpoint
   - Assert request/response schemas
   - Tests must fail (no implementation yet)

4. **Extract test scenarios** from user stories:
   - Each story → integration test scenario
   - Quickstart test = story validation steps

5. **Update agent file incrementally** (O(1) operation):
   - Run `/scripts/update-agent-context.sh [claude|gemini|copilot]` for your AI assistant
   - If exists: Add only NEW tech from current plan
   - Preserve manual additions between markers
   - Update recent changes (keep last 3)
   - Keep under 150 lines for token efficiency
   - Output to repository root

**Output**: data-model.md, /contracts/*, failing tests, quickstart.md, agent-specific file

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:
- Load `/templates/tasks-template.md` as base
- Generate tasks from Phase 1 design docs (contracts, data model, quickstart)
- Each API endpoint → contract test task [P]
- Each entity → TypeScript interface task [P]
- Each user story → integration test task
- Implementation tasks to make tests pass

**Specific Task Categories**:
1. **Setup Tasks** (1-3 tasks)
   - Initialize Nuxt project with UI Pro
   - Configure Spotify API credentials
   - Setup testing framework

2. **Contract Test Tasks** (4-5 tasks) [P]
   - Test GET /api/spotify/genres
   - Test POST /api/spotify/search
   - Test GET /api/spotify/playlist/:id
   - Test POST /api/export

3. **Model Tasks** (8-10 tasks) [P]
   - Define Playlist interface
   - Define PlaylistOwner interface
   - Define SearchRequest/Result interfaces
   - Define Genre interface
   - Define export data structures

4. **API Implementation Tasks** (4-5 tasks)
   - Implement Spotify OAuth flow
   - Implement genre fetching
   - Implement playlist search
   - Implement export endpoints

5. **Library Tasks** (3 tasks)
   - Create spotify-client library
   - Create export-utils library
   - Create cache-manager library

6. **UI Component Tasks** (5-6 tasks)
   - Create search form component
   - Create results table component
   - Create export buttons
   - Create error/loading states
   - Create playlist card component

7. **Integration Test Tasks** (3-4 tasks)
   - Test full search flow
   - Test export functionality
   - Test caching behavior

**Ordering Strategy**:
- TDD order: Tests before implementation
- Dependencies: Setup → Models → Contract Tests → API → Libraries → UI → Integration
- Mark [P] for parallel execution within categories

**Estimated Output**: 35-40 numbered, ordered tasks in tasks.md

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation
*These phases are beyond the scope of the /plan command*

**Phase 3**: Task execution (/tasks command creates tasks.md)  
**Phase 4**: Implementation (execute tasks.md following constitutional principles)  
**Phase 5**: Validation (run tests, execute quickstart.md, performance validation)

## Complexity Tracking
*Fill ONLY if Constitution Check has violations that must be justified*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |


## Progress Tracking
*This checklist is updated during execution flow*

**Phase Status**:
- [x] Phase 0: Research complete (/plan command)
- [x] Phase 1: Design complete (/plan command)
- [x] Phase 2: Task planning complete (/plan command - describe approach only)
- [ ] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved
- [x] Complexity deviations documented (none required)

---
*Based on Constitution v2.1.1 - See `/memory/constitution.md`*
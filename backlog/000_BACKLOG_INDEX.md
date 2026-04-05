# Backlog Index

| ID | Phase | Status | Description | Branch | Depends On |
|----|-------|--------|-------------|--------|------------|
| 001 | — | [TEMPLATE](./001_TEMPLATE.md) | Template for new backlog items | — | — |
| 002 | 0 | [DONE](./_archive/002_PHASE0_MONOREPO_SETUP.md) | Monorepo setup + scaffolding | `feat/monorepo-setup` | — |
| 003 | 1 | [DONE](./_archive/003_PHASE1_DB_SCHEMA.md) | Database schema & types | `feat/db` | 002 |
| 004 | 1 | [DONE](./_archive/004_PHASE1_INDEXER_PARSERS.md) | Indexer config & event parsers | `feat/indexer` | 002 |
| 005 | 1 | [DONE](./_archive/005_PHASE1_WEB_LIB.md) | Web app library layer | `feat/web-lib` | 002 |
| 006 | 2 | [DONE](./_archive/006_PHASE2_INDEXER_CORE.md) | Indexer core + Edge Function | `feat/indexer-core` | 003, 004 |
| 007 | 2 | [DONE](./_archive/007_PHASE2_WEB_PAGES.md) | Web pages: home, agents, detail | `feat/web-pages` | 003, 005 |
| 008 | 2 | [DONE](./_archive/008_PHASE2_WEB_ACTIONS.md) | Web pages: leaderboard, register, forms | `feat/web-actions` | 003, 005 |
| 009 | 3 | [DONE](./009_PHASE3_INTEGRATION.md) | Integration & E2E testing | `feat/integration` | 006, 007, 008 |
| 010 | 4 | [IN_PROGRESS](./010_PHASE4_LOCAL_DEV.md) | Local dev setup & code quality | `feat/local-dev` | 009 |
| 011 | 4 | [TODO](./011_PHASE4_DEPLOY.md) | Deploy pipeline (CF Pages + GH Actions) | `feat/deploy` | 009 |
| 012 | 5 | [DONE](./012_PHASE5_RETRY_RESILIENCE.md) | Retry, backoff & RPC resilience | `feat/indexer-retry` | 009 |
| 013 | 5 | [DONE](./013_PHASE5_CONCURRENCY_INTEGRITY.md) | Concurrency guard & data integrity | `feat/indexer-integrity` | 012 |
| 014 | 5 | [DONE](./014_PHASE5_OBSERVABILITY.md) | Observability & ledger gap detection | `feat/indexer-observability` | 012 |
| 015 | 5 | [DONE](./015_PHASE5_ASYNC_URI.md) | Async URI resolution | `feat/indexer-async-uri` | 012 |
| 016 | 5 | [DONE](./016_PHASE5_SCHEMA_VALIDATION.md) | Schema & validation hardening | `feat/indexer-validation` | 012 |
| 017 | 6 | [DONE](./_archive/017_PHASE6_DISCOVERY_DB.md) | DB: discovery columns + advanced search | `feat/discovery-db` | 016 |
| 018 | 6 | [DONE](./_archive/018_PHASE6_URI_EXTRACT.md) | URI resolver: extract services/trust | `feat/uri-extract` | 017 |
| 019 | 6 | [DONE](./_archive/019_PHASE6_EVIDENCE_FLOW.md) | FeedbackForm: evidence chain (SHA-256 + IPFS) | `feat/evidence-flow` | 017 |
| 020 | 6 | [DONE](./_archive/020_PHASE6_METADATA_SPEC.md) | Metadata format spec alignment (docs) | `feat/metadata-spec` | — |
| 021 | 7 | [DONE](./_archive/021_PHASE7_AGENT_SERVICES.md) | Agent detail: services cards + trust badges | `feat/agent-services` | 017, 018 |
| 022 | 7 | [DONE](./_archive/022_PHASE7_SCORE_EVIDENCE.md) | Agent detail: score breakdown + evidence viewer | `feat/score-evidence` | 019 |
| 023 | 7 | [REVIEWED](./023_PHASE7_TAG_FILTER.md) | Agent detail: tag filter + per-client breakdown | `feat/tag-filter` | 017 |
| 024 | 7 | [REVIEWED](./024_PHASE7_ADVANCED_SEARCH.md) | Agents list: advanced filtering UI | `feat/advanced-search` | 017 |
| 025 | 8 | [TODO](./025_PHASE8_CLI_CONTRACTS.md) | CLI: reputation contract wrappers + types | `feat/cli-contracts` | — |
| 026 | 8 | [TODO](./026_PHASE8_CLI_CONFIG.md) | CLI: feedback config + evidence generator | `feat/cli-config` | 025 |
| 027 | 8 | [TODO](./027_PHASE8_CLI_SCRIPTS.md) | CLI: give-feedback, verify, update-metadata | `feat/cli-scripts` | 025, 026 |

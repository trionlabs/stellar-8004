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
| 010 | 4 | [DONE](./010_PHASE4_LOCAL_DEV.md) | Local dev setup & code quality | `feat/local-dev` | 009 |
| 011a | 4 | [DONE](./011_PHASE4_SUPABASE_DEPLOY.md) | Supabase compose deploy (s8004 prefix, 15/15 healthy) | `main` | 009 |
| 011b | 4 | [DONE](./011B_PHASE4_SVELTEKIT_DEPLOY.md) | SvelteKit Docker deploy (Dokploy Application) | `main` | 009, 011a |
| 011c | 4 | [DONE](./011C_PHASE4_DNS_ROUTING.md) | Cloudflare DNS + Origin Cert (Seçenek C, Kong kapalı) | `main` | 011a, 011b |
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
| 023 | 7 | [DONE](./_archive/023_PHASE7_TAG_FILTER.md) | Agent detail: tag filter + per-client breakdown | `feat/tag-filter` | 017 |
| 024 | 7 | [DONE](./_archive/024_PHASE7_ADVANCED_SEARCH.md) | Agents list: advanced filtering UI | `feat/advanced-search` | 017 |
| 025 | 8 | [SUPERSEDED](./025_PHASE8_CLI_CONTRACTS.md) | CLI: contract wrappers → superseded by 034 (SDK Core) | — | — |
| 026 | 8 | [SUPERSEDED](./026_PHASE8_CLI_CONFIG.md) | CLI: feedback config → superseded by 034 (SDK Core) | — | — |
| 027 | 8 | [SUPERSEDED](./027_PHASE8_CLI_SCRIPTS.md) | CLI: scripts → superseded by 034 (SDK Core) | — | — |
| 028 | 9 | [DEFERRED](./028_PHASE9_WALLET_REPUTATION.md) | Wallet reputation — ertelendi, gerçek veri gerekiyor | `feat/wallet-reputation` | 017 |
| 029 | 9 | [DEFERRED](./029_PHASE9_FEEDBACK_QUALITY.md) | Feedback quality signals — 028'e bağlı, ertelendi | `feat/feedback-quality` | 028 |
| 030 | 10 | [DONE](./030_PHASE10_AGENT_UPDATE.md) | Agent profile edit & management UI | `feat/agent-update` | — |
| 031 | 9 | [DEFERRED](./031_PHASE9_ENDPOINT_HEALTH.md) | Endpoint health check — ertelendi, 0 endpoint, SSRF riski | `feat/endpoint-health` | 017 |
| 032 | 10 | [DONE](./032_PHASE10_MY_AGENTS_UX.md) | My Agents UX: owner filter, badges, WalletButton, CTAs | `feat/my-agents-ux` | 030 |
| 033 | 9 | [DEFERRED](./033_PHASE9_FILTERED_SCORING.md) | Filtered scoring — 028'e bağlı, ertelendi | `feat/filtered-scoring` | 028 |
| 034 | 11 | [TODO](./034_PHASE11_SDK_CORE.md) | SDK Core: contract client + metadata builder + signers | `feat/sdk-core` | — |
| 035 | 11 | [TODO](./035_PHASE11_SDK_API_CLIENT.md) | SDK API Client: read-only explorer wrapper | `feat/sdk-api-client` | 034 |
| 036 | 11 | [TODO](./036_PHASE11_SDK_DOGFOOD.md) | Dog-food: web app SDK'ya geçiş | `feat/sdk-dogfood` | 034, 035 |
| 037 | 11 | [TODO](./037_PHASE11_SDK_DOCS.md) | Developer portal: SDK docs + register example | `feat/sdk-docs` | 034 |
| 038 | 11 | [TODO](./038_PHASE11_SDK_PUBLISH.md) | npm publish: @trionlabs/stellar-erc8004-sdk | `feat/sdk-publish` | 034, 035, 036 |

# 020 — Metadata Format Spec Alignment (Documentation)

**Status:** REVIEWED
**Owner:** Codex
**Phase:** 6 — Protocol Compliance
**Branch:** `feat/metadata-spec`
**Depends On:** —
**Plan:** [docs/plans/2026-04-05-protocol-compliance-and-discovery.md](../docs/plans/2026-04-05-protocol-compliance-and-discovery.md)
**Critic:** [docs/plans/020-phase6-metadata-spec-critic.md](../docs/plans/020-phase6-metadata-spec-critic.md)

## Context

Mevcut agent metadata formatı ERC-8004 spec'inden sapıyor:
- `type` field'ı `"Agent"` → spec `"https://eips.ethereum.org/EIPS/eip-8004#registration-v1"` bekliyor
- `endpoints` field'ı `[{type, url}]` formatında → spec `services: [{name, endpoint, version}]` formatında
- `supportedTrust` field'ı eksik veya yanlış yapıda
- **Spec'e göre geçerli `supportedTrust` değerleri:** `"reputation"`, `"crypto-economic"`, `"tee-attestation"` (kapalı enum değil ama spec'teki örnekler bunlar). Önceki plan "validation" ve "tee" kullanmıştı — bu yanlış.
- **Hash notu:** ERC-8004 spec EVM için keccak-256 belirtir. Stellar implementasyonumuz SHA-256 kullanıyor (trionlabs tasarım kararı). IPFS URI'lerde hash opsiyonel (spec).

Bu task dokümantasyon oluşturur. Gerçek metadata güncellemesi Task 027 (CLI update-metadata) ile yapılacak.

## File Scope

- Create: `docs/findings/8004/metadata-format-guide.md`

## Requirements

- [ ] Eski format → yeni format field mapping tablosu
- [ ] Spec referansları (EIP-8004 section links)
- [ ] `type` field: `"Agent"` → `"https://eips.ethereum.org/EIPS/eip-8004#registration-v1"`
- [ ] `endpoints` → `services` dönüşüm kuralları
- [ ] `supportedTrust` array yapısı ve geçerli değerler (spec örnekleri: `"reputation"`, `"crypto-economic"`, `"tee-attestation"` — kapalı enum değil ama spec terminolojisine uyulmalı)
- [ ] **DİKKAT:** Plan/backlog'da "validation" ve "tee" kullanılmış — bunlar spec'e uygun değil. Doğruları: `"crypto-economic"` (not "validation"), `"tee-attestation"` (not "tee")
- [ ] Örnek metadata JSON (eski ve yeni format)
- [ ] CLI update-metadata script'ine (Task 027) referans

## Implementation Plan

1. `docs/findings/8004/` dizini yoksa oluştur
2. `metadata-format-guide.md` yaz
3. Commit

### Commit:
```bash
git add docs/findings/8004/metadata-format-guide.md
git commit -m "docs: ERC-8004 metadata format alignment guide"
```

## Verification

- [ ] Dokümantasyon eski ve yeni format arasındaki farkları net açıklıyor
- [ ] Spec referansları doğru ve güncel
- [ ] Örnek JSON'lar geçerli ve spec-compliant

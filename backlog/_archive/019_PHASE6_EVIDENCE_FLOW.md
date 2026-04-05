# 019 — FeedbackForm: Evidence Chain (SHA-256 + IPFS)

**Status:** DONE
**Owner:** Codex
**Phase:** 6 — Protocol Compliance
**Branch:** `feat/evidence-flow`
**Depends On:** 017
**Plan:** [docs/plans/2026-04-05-protocol-compliance-and-discovery.md](../docs/plans/2026-04-05-protocol-compliance-and-discovery.md)
**Critic:** [docs/plans/019-phase6-evidence-flow-critic.md](../docs/plans/019-phase6-evidence-flow-critic.md)

## Context

FeedbackForm şu anda `crypto.getRandomValues(new Uint8Array(32))` ile random hash üretiyor ve `feedbackUri` boş string geçiyor. Bu, ERC-8004'ün temel güven mekanizması olan evidence chain'i kırıyor. Spec: "feedbackURI: a file URI pointing to an off-chain JSON", "We suggest using IPFS or equivalent services."

**Hash algoritması notu:** SHA-256, trionlabs Stellar kontratlarının tasarım kararıdır — ERC-8004 spec'i EVM için keccak-256 belirtir. Stellar implementasyonumuzda SHA-256 kullanıyoruz. IPFS URI kullanıldığında spec'e göre feedbackHash opsiyoneldir, ancak biz yine de ekliyoruz (best practice).

**Mevcut sorun:** Random hash + boş URI = doğrulanamaz feedback = protokolün amacına aykırı.

## File Scope

- Create: `apps/web/src/lib/evidence.ts`
- Create: `apps/web/src/lib/server/ipfs.ts` (SERVER-SIDE ONLY — JWT browser'a gitmez)
- Create: `apps/web/src/routes/api/ipfs-upload/+server.ts` (server endpoint)
- Modify: `apps/web/src/lib/components/FeedbackForm.svelte`
- Modify: `.env.example`

## Requirements

- [ ] `evidence.ts`: `buildFeedbackEvidence(params)` — spec-aligned evidence JSON oluştur
- [ ] `evidence.ts`: `sha256Hash(content)` — `crypto.subtle.digest('SHA-256', ...)` ile hash hesapla
- [ ] `server/ipfs.ts`: `uploadEvidence(name, data)` — Pinata API ile IPFS'e yükle, `ipfs://{CID}` döndür (**SERVER-SIDE ONLY**)
- [ ] `routes/api/ipfs-upload/+server.ts`: POST endpoint — client evidence JSON gönderir, server Pinata'ya yükler, CID döndürür
- [ ] FeedbackForm'da: evidence oluştur → SHA-256 hash → `/api/ipfs-upload` endpoint'ine POST → `feedbackUri` + `feedbackHash` olarak contract'a gönder
- [ ] `crypto.getRandomValues` kullanımını kaldır
- [ ] IPFS upload opsiyonel (başarısız olursa boş URI ile devam, ama hash yine gerçek evidence'dan)
- [ ] **GÜVENLİK:** `PINATA_JWT` PRIVATE env variable (`$env/static/private` veya `$env/dynamic/private`) — `PUBLIC_` prefix KULLANMA
- [ ] Alternatif pattern: Pinata V3 presigned URL (server signed URL üretir → client direkt Pinata'ya upload eder — daha performanslı)

## Implementation Plan

Plan'daki Task 019 (Detailed Tasks bölümü) birebir takip edilecek. Kod `docs/plans/2026-04-05-protocol-compliance-and-discovery.md` Step 1-5'te mevcut.

### Adımlar:
1. `evidence.ts` oluştur (builder + hash utility)
2. `server/ipfs.ts` oluştur (Pinata upload helper — SERVER-SIDE ONLY)
3. `routes/api/ipfs-upload/+server.ts` oluştur (POST endpoint — client'ın IPFS upload'ı buradan geçer)
4. FeedbackForm'u güncelle (evidence flow — IPFS upload `/api/ipfs-upload` üzerinden)
5. `.env.example`'a `PINATA_JWT` ekle (**PUBLIC_ prefix YOK**)
6. Commit

### Commit:
```bash
git add apps/web/src/lib/evidence.ts apps/web/src/lib/server/ipfs.ts apps/web/src/routes/api/ipfs-upload/+server.ts apps/web/src/lib/components/FeedbackForm.svelte
git commit -m "feat(web): real evidence chain in FeedbackForm (SHA-256 + IPFS upload)"
```

## Verification

- [ ] FeedbackForm submit'te evidence JSON oluşturuluyor (console.log ile doğrula)
- [ ] SHA-256 hash hesaplanıyor (random hash yok)
- [ ] IPFS upload başarılı → `ipfs://Qm...` URI döndürülüyor
- [ ] IPFS upload başarısız → graceful fallback (boş URI, ama gerçek hash)
- [ ] On-chain feedback'te `feedbackUri` ve `feedbackHash` doğru değerlerle kaydediliyor
- [ ] `PINATA_JWT` olmadan uygulama çökmüyor (upload atlanıyor)
- [ ] Pinata JWT browser'da expose olmuyor (Network tab'da header'larda görünmüyor)

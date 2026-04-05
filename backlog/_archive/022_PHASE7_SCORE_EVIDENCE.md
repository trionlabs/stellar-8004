# 022 — Agent Detail: Score Breakdown + Evidence Viewer

**Status:** DONE
**Owner:** Codex
**Phase:** 7 — Discovery UX
**Branch:** `feat/score-evidence`
**Depends On:** 019
**Critic:** [critic-022](../docs/plans/2026-04-05-022-score-evidence-critic.md)

## Context

Trust kararı verirken opak bir sayı yetmez. Kullanıcı formülü ve kanıtı görebilmeli. Şu anda Total Score tek bir sayı olarak gösteriliyor — formül breakdown'ı yok. Ayrıca `feedbackUri` DB'de var ama UI'da erişilemiyor — kullanıcı feedback'in kanıtını doğrulayamıyor.

## File Scope

- Modify: `apps/web/src/routes/agents/[id]/+page.svelte`
- Modify: `apps/web/src/routes/agents/[id]/+page.server.ts`
- Create: `apps/web/src/lib/components/ScoreBreakdown.svelte`
- Create: `apps/web/src/lib/components/EvidenceViewer.svelte`

## Requirements

- [ ] **ScoreBreakdown component:** Total Score'un yanında collapsible breakdown: "Avg Feedback: X (×0.6) + Volume Factor: Y (×0.2) + Avg Validation: Z (×0.2) = Total". Formül açıklaması tooltip
- [ ] **EvidenceViewer component:** Feedback satırında `feedbackUri` varsa "Evidence" badge/link → tıklayınca IPFS'den fetch → JSON pretty-print → hash doğrulama durumu (✓ verified / ✗ mismatch / ⚠ no hash)
- [ ] IPFS gateway timeout handling (10s timeout + graceful fallback: "Evidence unavailable")
- [ ] IPFS gateway: Pinata önce, ipfs.io fallback. Her iki gateway de başarısız → "Evidence unavailable"
- [ ] Leaderboard formülü **DEĞİŞMEYECEK** (60/20/20)

## Critic Fixes (Zorunlu)

### BLOCK-1: `feedback_uri` server load'da eksik
Mevcut `+page.server.ts` satır 90-108'deki feedback map'inde `feedback_uri` ve `feedback_hash` return objesine dahil edilmemiş. **EvidenceViewer bu verilere erişemez.**

```typescript
// Feedback map'ine ekle:
feedbackUri: feedback.feedback_uri,    // YENİ
feedbackHash: feedback.feedback_hash,  // YENİ
```

### WARN-1: IPFS fetch timeout zorunlu — AbortController pattern
```typescript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 10000);
try {
  const res = await fetch(gatewayUrl, { signal: controller.signal });
} finally {
  clearTimeout(timeout);
}
```

### WARN-2: IPFS gateway fallback stratejisi
Sıralama: (1) `gateway.pinata.cloud` → (2) `ipfs.io` → (3) "Evidence unavailable"

### WARN-3: Hash doğrulama hex normalization
`feedback_hash` DB'de text (hex string). `crypto.subtle.digest` Uint8Array döndürür. Her iki tarafı hex string'e normalize et:
```typescript
async function verifyHash(content: string, expectedHash: string): Promise<boolean> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex.toLowerCase() === expectedHash.toLowerCase();
}
```

### WARN-4: Volume factor tooltip açıklaması
"Volume Factor: logaritmik ölçekleme. 100 feedback'de maksimum (100) puana ulaşır. Formül: ln(feedback_count) / ln(100) × 100"

## Implementation Plan

Feature Checklist B3 ve B4 item'ları.

### Adımlar:
1. **`+page.server.ts`** — feedback map'ine `feedbackUri` ve `feedbackHash` ekle (BLOCK fix)
2. `ScoreBreakdown.svelte` component'ı oluştur (volume factor tooltip dahil)
3. `EvidenceViewer.svelte` component'ı oluştur (IPFS fetch + AbortController timeout + gateway fallback + hex hash verify)
4. Agent detail sayfasına entegre et
5. Commit

### Commit:
```bash
git add apps/web/src/lib/components/ScoreBreakdown.svelte apps/web/src/lib/components/EvidenceViewer.svelte apps/web/src/routes/agents/\[id\]/+page.svelte apps/web/src/routes/agents/\[id\]/+page.server.ts
git commit -m "feat(web): score breakdown and evidence viewer on agent detail page"
```

## Verification

- [ ] `feedbackUri` ve `feedbackHash` server load'dan client'a geçiyor
- [ ] Score breakdown doğru formülü gösteriyor (60/20/20) + volume factor tooltip
- [ ] Evidence viewer IPFS'den başarılı fetch yapıyor (Pinata → ipfs.io fallback)
- [ ] IPFS fetch 10s AbortController timeout'u ile çalışıyor
- [ ] Hash doğrulama: ✓ verified (hex normalized), ✗ mismatch, ⚠ no hash
- [ ] IPFS'den fetch edilen JSON `JSON.stringify` ile render ediliyor (innerHTML değil — XSS koruması)
- [ ] IPFS timeout/hata'da graceful fallback mesajı
- [ ] feedbackUri olmayan feedback'lerde evidence butonu gösterilmiyor

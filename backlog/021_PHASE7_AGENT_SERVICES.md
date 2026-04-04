# 021 — Agent Detail: Services Cards + Trust Badges

**Status:** REVIEWED
**Owner:** Codex
**Phase:** 7 — Discovery UX
**Branch:** `feat/agent-services`
**Depends On:** 017, 018
**Critic:** [critic-021](../docs/plans/2026-04-05-021-agent-services-critic.md)

## Context

8004'ün asıl amacı keşif. "Bu agent'ın MCP endpoint'i ne?" sorusu bir tıkla cevaplanabilmeli. Şu anda `services` ve `supportedTrust` verileri raw JSON blob'unda gömülü — kullanıcı JSON parse etmek zorunda kalıyor. Bu kabul edilemez bir UX.

## File Scope

- Modify: `apps/web/src/routes/agents/[id]/+page.svelte`
- Modify: `apps/web/src/routes/agents/[id]/+page.server.ts`

## Requirements

- [ ] **Services kartları:** Her service için kart — protocol icon (MCP, A2A, Web), endpoint URL (kopyala butonu), version badge
- [ ] **SupportedTrust badge'leri:** Agent header'ında belirgin badge'ler: `reputation ✓`, `validation ✓` vb.
- [ ] Server-side: `supported_trust` ve `services` kolonlarından veri oku (agent_uri_data'dan değil)
- [ ] Boş services/trust durumunda graceful empty state ("No services registered" / "No trust mechanisms supported")
- [ ] Protocol icon mapping: `MCP` → ilgili icon, `A2A` → ilgili icon, `Web` / default → globe icon. Ayrı utility map oluştur (`$lib/icons/protocol-icons.ts`), inline `{#if}` zinciri yerine
- [ ] Endpoint URL kopyalama: clipboard API ile tek tıkla kopyala

## Critic Fixes (Zorunlu)

### WARN-1: Services JSONB type safety
`services` kolonu `jsonb` → TypeScript'te `unknown`. `+page.server.ts`'de normalize et:

```typescript
function normalizeServices(raw: unknown): Array<{ name: string; endpoint: string; version?: string }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is Record<string, unknown> => s != null && typeof s === 'object')
    .map((s) => ({
      name: typeof s.name === 'string' ? s.name : 'unknown',
      endpoint: typeof s.endpoint === 'string' ? s.endpoint : '',
      version: typeof s.version === 'string' ? s.version : undefined,
    }))
    .filter((s) => s.endpoint.length > 0);
}
```

### WARN-2: Clipboard API SSR guard
`navigator.clipboard` browser-only. SSR-safe yapılmalı:

```svelte
<script>
  let canCopy = $state(false);
  onMount(() => { canCopy = true; });

  async function copyToClipboard(text: string) {
    if (canCopy) await navigator.clipboard.writeText(text);
  }
</script>
```

## Implementation Plan

Feature Checklist B1 ve B2 item'ları. Agent detail sayfasının mevcut yapısına uygun component'lar eklenecek.

### Adımlar:
1. `+page.server.ts`'de `supported_trust` ve `services` kolonlarını query'e ekle + `normalizeServices` helper
2. `+page.svelte`'de Services section ekle (kartlar) + SSR-safe clipboard
3. `+page.svelte`'de SupportedTrust badge'lerini agent header'ına ekle
4. Responsive tasarım (mobile-first), mevcut token'ları kullan (`border-border`, `bg-surface`, `text-accent`)
5. Commit

### Commit:
```bash
git add apps/web/src/routes/agents/\[id\]/+page.svelte apps/web/src/routes/agents/\[id\]/+page.server.ts
git commit -m "feat(web): services cards and trust badges on agent detail page"
```

## Verification

- [ ] Services kartları doğru render ediliyor (icon, URL, version)
- [ ] Trust badge'leri header'da görünüyor
- [ ] Endpoint URL kopyalama çalışıyor (SSR'de crash yok)
- [ ] Services/trust boş olan agent'larda boş state gösteriliyor
- [ ] Services JSONB type-safe normalize ediliyor (geçersiz entry'ler filtreleniyor)
- [ ] Mobile responsive

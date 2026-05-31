---
title: Spike 3 — Discount code creation (manual DevTools capture)
type: reference
status: pending capture
---

# Spike 3 — POST /discount-codes

> Os outros 3 spikes correm via `scripts/strikelab-yogo-spikes.sh`.
> Este precisa de DevTools porque a Yogo skill não documenta o endpoint POST.

## O que vamos descobrir

Se a Yogo admin UI envia um `POST /discount-codes` (ou similar) quando cria um coupon, e qual é o body shape. Isto desbloqueia o "Discount Apply Tool" no admin StrikeLab — sem isto, Marcelo cola coupons à mão cada mês.

## Passos (5 minutos)

### 1. Abre o Yogo admin
Navega para `https://strikershouse.yogobooking.pt/admin/discount-codes` (ou onde gerires códigos).

### 2. Abre DevTools
- Chrome/Brave: `Cmd+Option+I` → tab **Network**
- Filtra por `XHR` ou `Fetch` para esconder ruído
- Clica no botão 🚫 (Clear) para começar com a lista limpa

### 3. Cria um coupon de teste
Click "Adicionar" / "Novo código" no admin UI. Preenche:

| Campo | Valor |
|---|---|
| Nome | `SPIKE_TEST_DELETE_ME` |
| Tipo | Percentagem (10%) |
| Aplica-se a | Qualquer membership/plan (tanto faz para o spike) |
| Limite por cliente | 1 |
| Limite total | 1 |

Submete.

### 4. Captura o request
No Network tab, encontra a request `POST` (provavelmente para `/discount-codes` ou similar):

1. Click direito → **Copy** → **Copy as cURL** (vai dar comando completo com headers)
2. Cola num ficheiro chamado `spike-3-create-coupon.curl.txt` em `strikedash_vault/yogo-spikes/`

E também:
1. Click no request → tab **Payload** → click **view source**
2. Copia o body JSON
3. Cola em `strikedash_vault/yogo-spikes/spike-3-create-coupon-body.json`

E também:
1. Tab **Response** → copia tudo
2. Cola em `strikedash_vault/yogo-spikes/spike-3-create-coupon-response.json`

### 5. Apaga o coupon de teste
Na Yogo admin → encontra `SPIKE_TEST_DELETE_ME` → apaga.

Bónus: enquanto apagas, captura o DELETE também (mesmo procedimento).
Guarda como `spike-3-delete-coupon.curl.txt`.

## Quando terminares

Diz-me e eu analiso os 3 ficheiros para:
- Confirmar URL exacto do endpoint
- Mapear o body shape para os campos de `schemas.md` (linha 346-371 do skill)
- Escrever a função `createDiscountCode()` em `src/lib/yogo/discount-codes.ts`
- Wire na Phase 1 do plano StrikeLab (Discount Apply Tool)

## Anonimização

O body do POST não vai conter PII de outros clientes — só o coupon que estás a criar. Os ficheiros ficam local (`.gitignore` já cobre `*.json` neste directório).

Se o cURL tiver o `Authorization: Bearer ...` token completo: **edita-o** antes de partilhar comigo. Substitui o token por `Bearer REDACTED`. O resto pode ficar.

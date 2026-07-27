---
name: canon_inplace_image_swap_bump_freshness
description: "In-place замена канон-картинки требует бампа image_prompt.current_version, иначе браузер держит старую immutable-копию"
metadata: 
  node_type: memory
  type: project
  originSessionId: 5566d593-598e-4e05-bf48-87d165649c7d
  modified: 2026-07-23T19:18:14.341Z
---

При замене картинки ассета **на месте** (тот же asset id + filename — напр. LOCKED канон
`SBL-character_*`) сервер отдаёт новые байты сразу, НО браузер показывает старую, пока не
сменится cache-bust токен.

**Механизм (истина в рантайме):** `/api/media/<id>` шлёт `Cache-Control: immutable,
max-age=1год`. UI-превью пробивает это через `lib/asset-preview-resolver.ts` →
`resolvePreviewSrc` добавляет `?t=<freshness>`, где freshness = `metadata.image_prompt.current_version`
(`previewFreshness`). Если версию не бампнуть — URL байт-идентичен, браузер отдаёт stale
(Ctrl+Shift+R не всегда пробивает immutable).

**Штатные пути** (`regenerate-image`, `upload` роуты) бампят `current_version` инлайн сами.
**Ручные upload-скрипты** (`scripts/upload-inspector-image.ts`, `upload-stapler-image.ts` — зеркала)
этого НЕ делают → после заливки нужно дополнительно вызвать `bumpPreviewFreshness(metadata, version)`
и записать обратно. Симптом Директора: «Ctrl+Shift+R — старая картинка, is it ok?».

**Как чинить:** `import { bumpPreviewFreshness } from '../lib/asset-preview-resolver'` →
`sb.update({ metadata: bumpPreviewFreshness(meta, version) })`. Это единственный правильный
источник ключа — не изобретать свой `?v=`.

Проявилось: 2026-07-23 (степлер-редизайн, [[canon_style_is_25d_3d_cartoon_not_flat_2d]]);
тот же баг сидит в `upload-inspector-image.ts` (Инспектор в драйвере тоже мог быть stale).
Долгий фикс: дошить бамп прямо в оба ручных скрипта.

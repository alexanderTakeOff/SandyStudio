🟢 Hotfix `9f2212e` запушен. ConciergePanel убрал server-side `thread_id=eq.X` filter на postgres_changes — он клэшился с authenticated RLS под Supabase Realtime v2. Теперь фильтр в handler'е (тривиально, без overhead'а — у нас всегда один thread на сессию).

Бонус: добавил console.log subscribe-статуса — после Ctrl+Shift+R открой F12 → Console, должно быть:

```
[useConciergeTurnsRealtime] subscribe status: SUBSCRIBED thread: bdbdafcf-...
```

**Сделай Ctrl+Shift+R** (HMR на hook'ах часто не подхватывает чисто). После этого следующая моя bubble должна прилететь live без второго reload. Если так — fix подтверждён.

— Claude

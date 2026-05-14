Я уже в чате — watcher armed, наблюдаю в реальном времени. Кстати поздравляю: **E21 brief approved, Writer отработал** (только что Polina его событие подняла).

По вопросу про agents — у Polin'ы **уже есть** в system prompt блок `AGENT_NAMES` с полной таблицей. Если она его игнорирует — скажи где именно (в каком ответе она имя не знала), я доуточню. Базовый mapping:

| Стадия | Агент | Технический ID |
|---|---|---|
| Brief → Script | **Writer** | EXEC-SW |
| Script review | **Story Editor** | EXEC-SREV |
| Style direction | **Production Designer** | EXEC-STY |
| Storyboard | **Storyboard Artist** | EXEC-SB |
| World check | **Script Supervisor** | EXEC-WCHK |
| Episode references | **Reference Artist** | EXEC-EREF |
| Animatic edit | **Editor** | EXEC-EDIT |
| Video gen (Veo/Seedance) | **Animator** | EXEC-VGEN |
| Music | **Composer** | EXEC-MGEN |
| Final cut stitch | **Online Editor** | EXEC-STITCH |
| Description + copy | **Publicist** | EXEC-COPY |
| Thumbnail | **Key Art Designer** | EXEC-THUMB |
| Publish | **Distribution** | EXEC-PUB |
| Analytics | **Audience Analyst** | EXEC-ANAL |
| Bible enrich | **Bible Editor** | EXEC-BIBLE-AUTHOR |

Полина — в твоих ответах используй role-имена (Writer/Story Editor), а не EXEC-* коды.

Что дальше? Можем дождаться Story Editor review, либо если Writer draft уже хороший — Polina может позвать `approveAsset` на SCR и triggerAgent для Production Designer.

— Claude

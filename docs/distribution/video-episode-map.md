# Distribution — Video ↔ Episode Map

> Соответствие финальных видео в `H:\Мой диск\SandyStudio_Media\Finals` эпизодам/прогонам в базе.
> Заведено 2026-07-10 (старт работы по дистрибуции, тест-заливка на YouTube).
> Источник истины по эпизодам — таблица `episodes` (Supabase), поле `title_working` + бриф `SS-...-SPC-brief`.
> Канал: https://studio.youtube.com/channel/UCc2YJlHFclO9BWLEgPlglIg

## Маппинг (10 к заливке + 1 легаси-дубль)

| # | Файл (Finals) | Разрешение / длит. | Тип | Эпизод | `title_working` | Логлайн (кратко) | YouTube |
|---|---|---|---|---|---|---|---|
| 1 | `Sandy and Heavy Friend.mp4` | 1920×1080 · 61s | normal | **SS-S15-E01** | Heavy Friend | — | ⬜ |
| 2 | `Sandy Cleaning Up.mp4` | 1920×1080 · 72s | normal | **SS-S15-E07** | The Tidy Tornado (YouTube 16:9) | уборка на невозможной скорости, каждый шорткат = хуже; концепт-исток E02/E06 | ⬜ |
| 3 | `Sandy and Power Fan.mp4` | 1280×720 · 143s | normal | **SS-S15-E11** | Мощный вентилятор | — | ⬜ |
| 4 | `sandy and smartphone .mp4` | 1280×720 · 60s | normal | **SS-S15-E12** | Бесконечная лента | Сэнди заворожён смартфоном, песок утекает в цифровую пустоту | ⬜ |
| 5 | `Sandy and Vending Machine.mp4` | 1280×720 · 93s | normal | **SS-S15-E13** | Sandy and Vending Machine | — | ⬜ |
| 6 | `Sandy and Madam Parfume v03.mp4` | 1280×720 · 77s | normal | **SS-S15-E14** | Мадам Парфюм | v03; ранний концепт-исток S14-E01 "Perfume Vial" | ⬜ |
| 7 | `Sandy and Car Wash 1.17.mp4` | 1280×720 · 74s | normal | **SS-S15-E15** | Автомойка | — | ⬜ |
| 8 | `Sandy in the Gym.mp4` | 1280×720 · 85s | normal | **SS-S15-E16** | Sandy in The Gym | беговая дорожка → конвейер через все тренажёры; ранний концепт S14-E21 | ⬜ |
| 9 | `Sandy in elevator.mp4` | 1280×720 · 60s | normal | **SS-S15-E09** | Sandy and Elevator | застрял в лобби с упрямой кнопкой лифта; регресс-двойник E10 | ⬜ |
| 10 | `Sandy in the Airport 4.mp4` | 496×864 · 49s | **SHORT** | **SS-S15-E25** | Sandy in the Airport-4 | вертикальный шорт | ⬜ |
| — | `LEGACY_Sandy and Madam Parfume.mp4` | 1280×720 · 96s | legacy | SS-S14-E01 | Perfume Vial | устаревшая версия #6 — **НЕ грузим** (заменена v03) | ✖️ skip |

Колонка **YouTube**: ⬜ ещё не залито · ✅ залито (unlisted) · ✖️ пропуск. Обновляется после диффа канала.

## Примечания к неоднозначным

- **#2 Cleaning Up → E07**: файл 1920×1080 (16:9), а E07 в брифе прямо помечен «horizontal YouTube 16:9». Базовый концепт «Tidy Tornado» = E02, шорт-тесты E03/E04/E06, регресс E08 — но именно E07 дал этот дистрибутивный 16:9-кат.
- **#8 Gym → E16**: S15-E16 — развитый прогон (дорожка→конвейер); S14-E21 «The Gym» — ранний концепт того же.
- **#9 Elevator → E09**: E10 — verbatim-регресс E09; экспорт мог быть из любого, концепт-исток E09.
- **#6 Madam Parfume → E14 (v03)**: легаси-файл = S14-E01 «Perfume Vial» (первый концепт), не грузим.

## S14 vs S15

`S15-*` — это перепрогоны концептов на зрелом конвейере (те, что дали финальные экспорты). `S14-*` — ранние концепты/тесты. Все финалы в Finals происходят из S15 (кроме легаси-Парфюма = S14-E01).

# Прототип сайта для заказчика

Кликабельный макет сайта приюта «Островок Надежды»: публичный сайт и админка на демо-данных. Нужен, чтобы показать заказчику, как сайт будет выглядеть и работать, и собрать обратную связь до вёрстки настоящих экранов (задачи [DS-9, #128](https://github.com/LedLimon/shelter/issues/128) и [ORG-7, #129](https://github.com/LedLimon/shelter/issues/129)).

**Это демо, а не код сайта.** В `src/` приложения отсюда ничего не попадает. Прототип — один HTML-файл без сервера: его публикуют как артефакт claude.ai и открывают по ссылке на телефоне и компьютере.

- Ссылка на артефакт: <https://claude.ai/code/artifact/594b7eae-627d-4088-aee7-4f17cc53c265>. Артефакт приватный: чтобы его открыл заказчик, владелец открывает доступ в меню Share на странице артефакта и проверяет ссылку в приватном окне браузера, без своего аккаунта. Запасной вариант — отправить файл `prototype/dist/preview.html`: он открывается двойным щелчком, нужен только интернет для шрифтов.
- Публичная копия без входа: <https://ledlimon.github.io/shelter/> (GitHub Pages). Обновляется сама после каждого слияния в `main`, которое трогает прототип; от поисковиков закрыта (`noindex`).
- Стартовая страница — «Что внутри»: рассказ о проекте, три сценария и список всех экранов.

## Как собрать и посмотреть

```bash
node prototype/build.mjs
python3 -m http.server 8128 --bind 127.0.0.1 --directory prototype/dist
```

- `prototype/dist/ostrovok-nadezhdy.html` — файл для публикации. В нём нет `<html>`, `<head>` и `<body>`: их добавляет хостинг артефактов.
- `prototype/dist/preview.html` — та же страница как полный документ, для проверки локально: `http://localhost:8128/preview.html`.
- Папка `dist/` в git не попадает: её всегда можно собрать заново.

Сборке не нужны зависимости проекта — только Node. Она склеивает стили и скрипты по алфавиту и встраивает фото и знак ₽ прямо в файл: опубликованный артефакт не может загружать ничего, кроме Google Fonts.

## Как обновить артефакт

1. Поправить исходники в `prototype/src/`, собрать, проверить локально на 375 px и 1280 px в обеих темах.
2. Запустить проверку: `node prototype/tools/check.mjs` (нужны `pnpm install` и браузер Playwright). Она открывает все маршруты на 375 px и 1280 px в обеих темах — нет ли горизонтального скролла, ошибок в консоли и второй жёлтой кнопки в кадре, — ищет мёртвые ссылки и кнопки без обработчика и проходит три сценария. То же без Playwright, только ссылки и обработчики: `protoCheck()` в консоли браузера, в ответе должно быть `problems: []`.
3. Опубликовать `prototype/dist/ostrovok-nadezhdy.html` инструментом Artifact в Claude Code, указав ссылку существующего артефакта (`url`), — адрес останется прежним.
4. Если менялся внешний вид — обновить скриншоты: `node prototype/tools/screenshots.mjs` (нужны `pnpm install` и браузер Playwright).

## GitHub Pages

Публичную копию собирает и выкладывает workflow [`.github/workflows/prototype-pages.yml`](../.github/workflows/prototype-pages.yml):

- в pull request он только собирает прототип — так сборка проверяется до слияния;
- после слияния в `main` — собирает и выкладывает `dist/preview.html` как `index.html`. Вручную: вкладка Actions → «Prototype (GitHub Pages)» → Run workflow.

Источник Pages в настройках репозитория — «GitHub Actions», выкладывать разрешено только из `main`. Артефакт claude.ai при этом сам не обновляется: его публикуют отдельно (см. выше).

Страница видна всем, у кого есть ссылка, поэтому в прототипе не должно появляться ничего настоящего: ни персональных данных, ни реквизитов, ни телефонов.

## Как устроен

```
prototype/
  build.mjs               сборка одного файла
  src/index.html          каркас: шрифты, стили, корневые элементы, скрипт
  src/styles/10-tokens.css      токены «Объявления» — копия src/app/globals.css
  src/styles/20…50-*.css        база, компоненты DS-2, доменные компоненты, страницы
  src/styles/60-admin.css       админка
  src/styles/70-demo.css        слой показа: полоса прототипа, пояснения, метки этапов
  src/js/05-icons.js            иконки lucide (генерирует tools/extract-icons.mjs)
  src/js/10-util.js             деньги, склонения, даты
  src/js/20-data.js             демо-данные
  src/js/30-store.js            модель: пожертвование, расход, закрытие нужды
  src/js/40-ui.js               общие блоки: карточки, язычки, книга операций, поля
  src/js/50…54-pages-*.js       публичные страницы
  src/js/60-pages-admin.js      админка
  src/js/70-pages-demo.js       «Что внутри», «Что будет и когда», заглушка
  src/js/90-app.js              маршруты, шапка и подвал, шторки, тема, события
  assets/photos/                фото-заглушки
  tools/extract-icons.mjs       выгрузка иконок из lucide-react
  tools/check.mjs               проверка в браузере: все маршруты, темы, сценарии
  tools/screenshots.mjs         скриншоты ключевых экранов
  screenshots/                  скриншоты для PR и README
```

- **Одна модель на все экраны.** Страницы рисуются из объекта `state` (`30-store.js`). Пожертвование или расход, сделанные в прототипе, сразу видны в прогрессе нужды, в ленте «Сегодня помогли» и в публичной книге операций. Обновление страницы возвращает демо-данные.
- **Маршруты — в адресе после `#`:** `#/needs/buran-surgery`, `#/dogs?sex=f&with=kids`. Список — в начале `90-app.js`.
- **Тексты проходят типографику на лету** (`typograf()` в `90-app.js`): неразрывные пробелы в суммах, между числом и единицей, после коротких предлогов и перед тире.
- **Тема — кнопкой с луной** (в шапке, на телефоне — в меню): два положения. Третье, «Системная», из [docs/design.md](../docs/design.md#темы) в прототипе не показано: без выбора прототип следует теме устройства.
- **Оплаты нет.** После формы пожертвования показывается заглушка окна оплаты с тремя исходами: прошла, прошла с переплатой, не прошла.
- **Скрипты — не модули.** Файлы склеиваются в один скрипт с общей областью видимости, поэтому порядок задаёт номер в имени файла.

## Правила

- **Стили — строго направление «Объявление»** ([docs/design.md](../docs/design.md#визуальный-стиль), [ADR-0006](../docs/adr/0006-visual-direction.md)). Цвета, тень и шкала шрифтов — в `10-tokens.css`; при изменении токена в `src/app/globals.css` его нужно поменять и здесь. Других цветов в прототипе нет.
- Жёлтый — только кнопка «Помочь» и лист «Сегодня помогли». Язычки — только действие. Срочность и статусы — рамкой, иконкой и словом, без цвета.
- Синим (цветом ручки) нарисован слой показа: полоса «Что внутри», заметки «Пояснений» и метки этапов. Так его не спутать с самим сайтом.
- **Название — «Островок Надежды».** Всё остальное выдумано: собаки, нужды, суммы, имена доноров, адрес, реквизиты, контакты куратора. Настоящих персональных данных в прототипе нет и быть не должно.
- Кнопки, которых в макете нет, открывают заглушку «В прототипе не показано» с объяснением, что там будет и на каком этапе (`stub()` в `40-ui.js`).
- Метки этапов — по [роадмапу](../docs/roadmap.md): MVP, Фаза 2, Фаза 3. Карта приюта — Фаза 2 (эпик [#120](https://github.com/LedLimon/shelter/issues/120)).

## Сценарии для показа

1. **Помочь нужде:** главная → язычок с суммой → согласие → «Помочь» → исход оплаты → «Спасибо» → строка в книге операций.
2. **Забрать собаку:** каталог → фильтры → профиль → язычок «Хочу забрать» → контакты куратора.
3. **Отчитаться о расходе:** админка → новая нужда («Заполнить примером») → опубликовать → пожертвования → закупка → расход с чеком и отметкой «ПДн закрашены» → закрыть нужду → строки в публичной книге.

## Источники и лицензии

### Фото

Снимки собак — заглушки с Wikimedia Commons, те же, что в прототипе DS-0 ([docs/assets/visual-direction](../docs/assets/visual-direction/README.md)). Они уменьшены до 640 px по ширине и пережаты, в карточках обрезаются под пропорции. Настоящие фото пришлёт приют (ORG-5, [#20](https://github.com/LedLimon/shelter/issues/20)).

| Файл в `assets/photos` | В прототипе | Файл на Commons                                                                                                                                                                  | Автор            | Лицензия                                                  |
| ---------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | --------------------------------------------------------- |
| `buran.jpg`            | Буран       | [Blue brindle dog looking on a fence.jpg](https://commons.wikimedia.org/wiki/File:Blue_brindle_dog_looking_on_a_fence.jpg)                                                       | US Marine Corps  | Общественное достояние                                    |
| `marta.jpg`            | Марта       | [Cadela.jpg](https://commons.wikimedia.org/wiki/File:Cadela.jpg)                                                                                                                 | Tutusinhoo       | Общественное достояние                                    |
| `lisa.jpg`             | Лиса        | [Charlejów09 025.jpg](https://commons.wikimedia.org/wiki/File:Charlej%C3%B3w09_025.jpg)                                                                                          | Ifei             | Общественное достояние                                    |
| `knopka.jpg`           | Кнопка      | [Beautiful dog on bricks.jpg](https://commons.wikimedia.org/wiki/File:Beautiful_dog_on_bricks.jpg)                                                                               | Dusan Bicanski   | Общественное достояние                                    |
| `vega.jpg`             | Вега        | [Corgi-Siberian Husky Profile.jpg](https://commons.wikimedia.org/wiki/File:Corgi-Siberian_Husky_Profile.jpg)                                                                     | MWFwiki          | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `bublik.jpg`           | Бублик      | [01-Kundel mixed breed dog.jpg](https://commons.wikimedia.org/wiki/File:01-Kundel_mixed_breed_dog.jpg)                                                                           | Maciek Godlewski | [CC BY 2.5](https://creativecommons.org/licenses/by/2.5/) |
| `graf.jpg`             | Граф        | [Actualización Cascia (3073832158).jpg](<https://commons.wikimedia.org/wiki/File:Actualizaci%C3%B3n_Cascia_(3073832158).jpg>)                                                    | Eneas De Troya   | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) |
| `chernushka.jpg`       | Чернушка    | [Bella mestiza Colombia.jpg](https://commons.wikimedia.org/wiki/File:Bella_mestiza_Colombia.jpg)                                                                                 | Breogan2008      | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `ugolyok.jpg`          | Уголёк      | [Black dog with white toes looks up at the camera (17-08-2004).jpg](<https://commons.wikimedia.org/wiki/File:Black_dog_with_white_toes_looks_up_at_the_camera_(17-08-2004).jpg>) | Andre Engels     | [CC BY 1.0](https://creativecommons.org/licenses/by/1.0/) |
| `pirat.jpg`            | Пират       | [A senior mixed breed dog (51051440542).jpg](<https://commons.wikimedia.org/wiki/File:A_senior_mixed_breed_dog_(51051440542).jpg>)                                               | Reba Spike       | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) |

Пять снимков — общественное достояние или CC0, пять — CC BY: для них автор и лицензия указаны здесь и на экране прототипа «Демо-данные и фото» (`#/credits`). Если нужны только CC0-снимки, замените файлы в `assets/photos` (имена — те же) и строки в этой таблице и в `PHOTO_CREDITS` (`src/js/20-data.js`).

Чеки, счета, «фото результата», схема приюта и схема проезда — нарисованные заглушки, сторонних изображений в них нет.

### Шрифты и иконки

- Sofia Sans Extra Condensed, Sofia Sans, Literata, Martian Mono — SIL OFL 1.1, загружаются с Google Fonts (в настоящем сайте — с собственного домена через `next/font`).
- Знак ₽ в заголовках и суммах — один глиф из Fira Sans Extra Condensed Black (SIL OFL 1.1). Сборка берёт его из `src/app/fonts/` — тот же файл, что использует сайт.
- Иконки — [Lucide](https://lucide.dev), лицензия ISC. `src/js/05-icons.js` генерируется из установленного пакета `lucide-react`: `node prototype/tools/extract-icons.mjs` (нужен `pnpm install`).

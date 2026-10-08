# 0004. Хостинг и данные — в РФ

- Статус: Принято
- Дата: 2026-10-08

## Контекст

152-ФЗ требует локализации персональных данных граждан РФ (запись, хранение, обновление — в базах на территории РФ). Доноры, волонтёры, сотрудники — ПДн.

## Решение

- Хостинг: Yandex Cloud (VM / Serverless Containers, Managed PostgreSQL, Lockbox) или VPS Selectel/Timeweb + Docker Compose + управляемый Postgres. Next.js `output: standalone` за Caddy.
- Файлы: Yandex Object Storage + CDN (или Selectel S3).
- Email: Unisender Go или Yandex Cloud Postbox.
- Мониторинг: self-hosted GlitchTip и Uptime Kuma; аналитика — Яндекс Метрика после согласия на cookie.
- Не используем для ПДн: Vercel, Google Analytics, облачный Sentry, иностранные email-провайдеры, проксирование через Cloudflare.

## Последствия

- Чуть больше DevOps-работы (FND-10, OPS-3), зато нет юридических рисков и блокировок.
- Выбор конкретного провайдера и домен — задача ORG-6.

## Рассмотренные альтернативы

- Vercel + Neon — проще, но данные вне РФ.

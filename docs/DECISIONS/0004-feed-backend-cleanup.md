# ADR-0004: Backend cleanup миграций feed/stories

**Дата:** 2026-05-06
**Статус:** Accepted (do nothing)
**Контекст:** Round 1 удалила mobile-код Feed и Stories. SQLite-миграции v11 / v12 остаются нетронутыми. Backend feed-сервис продолжает работать.

## Контекст

В Round 1 (post-audit cleanup) удалена feature Feed/Stories из mobile. На клиенте остались таблицы `stories`, `story_views`, `feed_posts`, `feed_comments` (миграции v11 / v12); backend сервис `feed` продолжает крутиться на проде. Никто к нему не обращается, но и не отключён.

Вопрос: стоит ли продолжить cleanup — задиоунгрейд таблиц в backend Postgres, удалить сервис из docker-compose, провести миграцию rollback?

## Решение

**Ничего не удаляем.** Оставляем:
- SQLite v11/v12 миграции на клиенте (бенефит rollback-safety при необходимости вернуть feature).
- Backend `feed` сервис в проде (consumes ~50MB RAM, не нагружает БД при отсутствии запросов).
- Migrations `0016_stories` / `0017_feed_posts` в Postgres.

### Аргументы за «оставить»

1. **Необратимость**: DROP TABLE на проде — destroys данные навсегда. Если завтра решим вернуть Feed (например, в minified виде только для close-friends), миграция-rollback дешевле, чем backup-restore.
2. **Текущая стоимость низкая**: 1 unused service в docker-compose, 4 unused таблицы в Postgres. Не тормозит, не ест ресурсы заметно.
3. **Психологическая стоимость удаления высокая**: команда из 2 человек, неделя на cleanup ради экономии 50MB RAM — плохой trade-off.

### Аргументы против («подчистить»)

1. Мёртвый код в проде — security risk (если есть unauthenticated endpoint, который никто не патчит, это привлекательная цель для атак).
2. NATS subjects `feed.*` остаются зарегистрированы, занимают слот.
3. CI/CD пайплайн тратит время на сборку и тестирование сервиса, который никем не используется.

## Когда пересмотреть

Триггеры для нового ADR-0005 (full cleanup):
- 90 дней с момента этого ADR без возврата feature.
- Security audit найдёт уязвимость в feed-сервисе.
- Backend RAM/CPU давление — ресурсы понадобятся под другую фичу.
- Принято решение НЕ возвращать Feed в обозримом будущем (например, продукт повернулся в сторону B2B fitness coaching).

В этих случаях:
1. ADR-0005 формализует решение «удалить».
2. Создать backup Postgres feed-таблиц на S3/MinIO.
3. Деактивировать NATS subjects (передеплой `feed` без них).
4. `docker-compose.prod.yml`: удалить service.
5. Postgres migration `0019_drop_feed`: DROP TABLE с CASCADE для FK.
6. SQLite migration v19: DROP TABLE для feed_posts / feed_comments / stories / story_views.
7. Не торопиться: 7 дней wait между деплоем (4) и (5) чтобы можно было откатиться.

## Последствия

- Команда не тратит время на cleanup ради cleanup в Round 3.
- Backend cleanup remains documented как явное решение, не «забыли».
- Если кто-то спросит «почему feed-сервис всё ещё крутится?» — есть ссылка сюда.

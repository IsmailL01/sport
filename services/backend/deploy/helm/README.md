# Helm charts

Деплой backend-сервисов в Kubernetes (Phase 3 / P3-A-08).

## Что есть

- `identity/` — chart для identity-сервиса. Готов к `helm install`.
- `activity-sync/` — TODO (тот же шаблон, скопировать identity и поменять название + порт).

Helm-чарты — типовые: Deployment + Service + HPA (опционально), используют:
- `image.tag` (подставляется CI/CD из git SHA)
- секреты из `external-secrets-operator` (P3-A-10) или `sealed-secrets`:
  - `identity-db-url` — Postgres connection string
  - `identity-jwt-secret` — JWT signing key (≥32 символа)

## Сценарий установки (когда будет cluster)

```bash
# 1. Создать namespace
kubectl create namespace running-ecosystem

# 2. Создать секреты (для тестов; в проде — через external-secrets):
kubectl -n running-ecosystem create secret generic identity-db-url \
  --from-literal=url='postgres://re:re_dev@postgres:5432/running_ecosystem?sslmode=disable'
kubectl -n running-ecosystem create secret generic identity-jwt-secret \
  --from-literal=secret='your-jwt-secret-at-least-32-bytes-long'

# 3. Установить
helm install identity ./identity -n running-ecosystem \
  --set image.tag=$(git rev-parse --short HEAD)

# 4. Проверить
kubectl -n running-ecosystem get pods,svc
```

## Что ещё нужно для prod

- TLS (cert-manager + Let's Encrypt)
- Ingress (NGINX или Traefik)
- ServiceMonitor для Prometheus
- PodDisruptionBudget для HA
- NetworkPolicy для изоляции между сервисами

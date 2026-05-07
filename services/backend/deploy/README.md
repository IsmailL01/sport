# Deploy

Артефакты развёртывания backend Running Ecosystem.

## Структура

```
deploy/
├── helm/                # Helm-чарты для каждого сервиса
│   └── identity/        # пример (см. README внутри)
└── README.md (этот файл)
```

## Сценарии

### Local dev — `docker-compose`

См. [../README.md](../README.md). Из `services/backend/`:

```bash
make up                   # postgres only
JWT_SECRET=$(openssl rand -hex 32) make up-stack    # полный stack
make observability-up     # Grafana / Prometheus / Loki
```

### Staging / Prod — Helm

Когда будет K8s-кластер (Phase 3 / P3-A):

```bash
helm install identity ./deploy/helm/identity \
  -n running-ecosystem --create-namespace \
  --set image.tag=$(git rev-parse --short HEAD) \
  -f deploy/helm/identity/values-staging.yaml
```

`values-staging.yaml` создаётся per-environment с overrides для
- replicas
- resources
- secrets reference (external-secrets-operator)
- ingress (TLS, hostname)

### CI/CD

`.github/workflows/backend-ci.yml`:
- `test` — go test + race detector + coverage
- `docker` — build images через buildx, push в GHCR (после login setup)

ArgoCD pipeline (P3-A-09) — отдельная задача, после выбора кластера.

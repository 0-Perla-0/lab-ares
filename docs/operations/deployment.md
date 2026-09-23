# Deployment

Status: Defined locally; production target remains to be finalized.

- Build: repository quality/build scripts and Dockerfiles.
- Deploy: Docker Compose applies versioned Prisma migrations before services.
- Environment: frontend on 4321, backend on 3000, MariaDB configured by `.env`.
- Rollback: use the deployment platform's image rollback and compatible migration policy; no production procedure is established yet.

Source: [compose.yaml](../../compose.yaml) and [README.md](../../README.md).

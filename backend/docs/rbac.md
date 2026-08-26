# Backend authorization matrix

Permissions are centralized in `src/auth/permissions.ts`. A grant includes both
an action and its maximum data scope.

## Scopes

- `self`: only the authenticated user's own data.
- `area`: records belonging to `user.areaId`.
- `sede`: records belonging to `user.sedeId`.
- `global`: all records.

## Grants

| Permission                  | Prestador | Coordinador | Jefe área | Jefe sede | Jefe coordinadores | Admin  |
| --------------------------- | --------- | ----------- | --------- | --------- | ------------------ | ------ |
| Read attendance             | self      | area        | area      | sede      | global             | global |
| Check in                    | self      | self        | self      | self      | self               | global |
| Check out                   | self      | self        | self      | self      | self               | global |
| Correct attendance          | -         | area        | area      | sede      | global             | global |
| Validate hours              | -         | -           | area      | sede      | global             | global |
| Read/manage users           | -         | area        | area      | sede      | global             | global |
| Create Kairos projects      | -         | area        | area      | sede      | global             | global |
| Read organization catalogue | global    | global      | global    | global    | global             | global |
| Manage organization         | -         | -           | -         | sede      | -                  | global |

Creating a new sede requires `global` organization scope. A `JEFE_SEDE` can
modify only its own sede and the areas/turnos below it. Moving an area or turno
requires access to both the source and destination.

User reads and writes are filtered by the granted scope. A user cannot assign
or manage a role above their own (`PRESTADOR` < `COORDINADOR` < `JEFE_AREA` <
`JEFE_SEDE` < `JEFE_COORDINADORES` < `ADMIN`). Updates that move a user check
both the current and destination scope, and self-deletion is rejected.

The current attendance API exposes only `self` reads and self check-in/out.
Hierarchical reads, corrections and validation use the scopes above when their
next endpoints are introduced. A person who corrects a session cannot issue its
final validation, even when their global role grants both permissions.

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
| Read own attendance         | self      | self        | self      | self      | self               | global |
| Check in/out                | self      | self        | self      | self      | self               | global |
| Validate hours              | -         | -           | area      | sede      | global             | global |
| Read/manage users           | -         | area        | area      | sede      | global             | global |
| Create Kairos projects      | -         | area        | area      | sede      | global             | global |
| Read organization catalogue | global    | global      | global    | global    | global             | global |
| Manage organization         | -         | -           | -         | sede      | -                  | global |

Creating a new sede requires `global` organization scope. A `JEFE_SEDE` can
modify only its own sede and the areas/turnos below it. Moving an area or turno
requires access to both the source and destination.

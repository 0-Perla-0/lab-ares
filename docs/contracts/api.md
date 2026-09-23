# API contracts

Status: Verified for current implemented scope.

- Endpoints: health, auth, organization, users and attendance under `/api`.
- Inputs/outputs: OpenAPI 3.1 at [`backend/src/openapi/openapi.document.ts`](../../backend/src/openapi/openapi.document.ts), served at `/api/docs/openapi.json`.
- Errors: NestJS API exceptions plus Zod request validation.
- Authentication: HTTP-only persisted session; permissions use self/area/sede/global.
- Events: attendance events are persisted with actor, action, time and reason.

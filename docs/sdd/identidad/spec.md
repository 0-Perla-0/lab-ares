# Identidad y acceso

ID: `identidad` · Estado: implementada · Revisión: 2026-10-15

## Objetivo y alcance

Acceso por invitación, recuperación, sesiones y MFA opcional. Sin autorregistro, contraseñas temporales ni MFA obligatorio por rol.
Decisiones conservadas: 14B, 22B, 22.1B, 22.2B. Depende de [comunicaciones](../comunicaciones/spec.md).

## Reglas y criterios de aceptación

- **AC-1:** Invitación privada, revocable, de un uso y 72 h; recuperación genérica para cuentas activas, token de 30 min que invalida el anterior.
- **AC-2:** Contraseñas de 15–128 caracteres, Unicode/espacios, sin composición ni rotación periódica; rechazo de comunes/contextuales. Argon2id nuevo; bcrypt sólo transición.
- **AC-3:** Sesión persistida, cookie HTTP-only, 30 min inactiva/8 h absoluta; cambios sensibles revocan sesiones. Aviso de expiración no mantiene actividad por sí solo.
- **AC-4:** TOTP opcional para todos, códigos de un uso, consumo atómico; reautenticación sensible de 15 min con contraseña y factor si está activo. Sin replay automático tras reautenticar.
- **AC-5:** Recuperación administrativa por otra autoridad, identidad verificada, alcance/auditoría/revocación; nunca revelar ni elegir contraseña ajena. Throttle compartido, sin bloqueo permanente arbitrario.

## Diseño y evidencia

- [Auth](../../../backend/src/auth/), [invitaciones](../../../backend/src/invitations/), [recuperación administrativa](../../../backend/src/users/administrative-recovery.service.ts).
- UI: [seguridad](../../../frontend/app/portal/seguridad/), [invitación](../../../frontend/app/invitacion/), [recuperación](../../../frontend/app/recuperar/).
- [Pruebas de seguridad](../../../backend/test/unit/auth/), [concurrencia MFA real](../../../backend/test/integration/mfa-completion.integration.test.ts), [recorrido real](../../../frontend/fullstack/completion.spec.ts).
- Corpus offline opcional con checksum y TLS DB verificable existen; no equivalen a corpus institucional ni TLS de proveedor verificados.
- Revisión estática de implementación; evidencia local heredada en [memoria](../../../MEMORY.md), no aceptación nueva.

## Tareas y pendientes

- [x] **T1 · código · AC-1/3/4/5:** Flujos API/UI, assurance reciente, throttle durable y consumo MFA transaccional presentes.
- [ ] **T2 · validación · AC-2/4/5:** Calibrar Argon2/throttle bajo carga, carreras administrativas y revocación multirréplica.
- [ ] **T3 · externo · AC-2/5:** Aprobar corpus, procedimiento de identidad, secretos, TLS/proxy y canal institucional.

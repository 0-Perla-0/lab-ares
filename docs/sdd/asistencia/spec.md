# Asistencia, riesgo y validación

ID: `asistencia` · Estado: implementada · Revisión: 2026-10-15

## Objetivo y alcance

Entrada/salida, corte, revisión, bolsa y contingencia. Decisiones 2A, 2.1B, 3B, 3.1C, 4B, 17B y 29B.
Online-first; no check-in offline ni turnos nocturnos en el alcance inicial.

## Reglas y criterios de aceptación

- **AC-1:** Hora del servidor, una sesión abierta por usuario, claves idempotentes y snapshot de asignación/política al entrar.
- **AC-2:** Corte 23:59 `America/Mexico_City`: omisión de salida exige revisión, riesgo rojo y horas excluidas hasta resolución; festivo no evita cierre técnico.
- **AC-3:** Riesgo consultivo separado de validación. Base: <5 min rojo; 5–29 amarillo; 30 min–8 h normal; >8–10 h amarillo; >10 h rojo. Corregida al menos amarilla.
- **AC-4:** Coordinación corrige; jefaturas validan por alcance, nunca sujeto/corrector/capturista. Lote sólo verde, máximo 100, estado/riesgo/versión revalidados; no rechazo/corrección masiva.
- **AC-5:** Geolocalización opcional con timeout 3 s y CIDR/proxy explícitos, nunca bloqueante. Señales privadas sólo con autorización/lectura auditada; no seguimiento continuo.
- **AC-6:** Contingencia requiere ticket/motivo/intervalo, evita solapamiento y queda `PENDIENTE`; nunca acredita automáticamente. Barrera produce modo lectura con snapshot distinguible.

## Diseño y evidencia

- [Asistencia](../../../backend/src/attendance/), [UI](../../../frontend/app/portal/asistencia/), [validaciones](../../../frontend/app/portal/validaciones/).
- [Integración base](../../../backend/test/integration/attendance.integration.test.ts), [operativa](../../../backend/test/integration/operational-phases.integration.test.ts), [full-stack](../../../frontend/fullstack/operational.spec.ts).
- IP se deriva de socket/cadena de proxies confiables; `TRUSTED_PROXY_CIDRS` no debe aceptar redes universales.
- `ATTENDANCE_WORKER_ENABLED=false` por defecto; timer no demuestra ejecución ni protección universal por época.
- Dependencias: [calendario](../calendario/spec.md), [ausencias](../ausencias/spec.md), [operación](../operacion/spec.md).

## Tareas y pendientes

- [x] **T1 · código · AC-1/2/3/4/5/6:** Recorrido API/UI, corte, revisión y contingencia existentes.
- [ ] **T2 · validación · AC-2/4/6:** Ensayar corte/corrección/freeze concurrentes entre réplicas y revocación antes del efecto.
- [ ] **T3 · validación · AC-5/6:** Dispositivos/ubicación real, teclado/lector de pantalla y desconexión; ver [entrega](../entrega/spec.md).
- [ ] **T4 · externo · AC-3/5:** Revisar políticas de sede/proxies; activación del worker sólo autorizada.

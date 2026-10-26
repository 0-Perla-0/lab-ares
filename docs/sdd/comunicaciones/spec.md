# Notificaciones y correo

ID: `comunicaciones` · Estado: parcial · Revisión: 2026-10-26

## Objetivo y alcance

Centro interno y correo transaccional mediante outbox. Decisión 15B.
Correo operativo genérico con enlace; no escritos, binarios, rutas privadas ni secretos. Identidad usa canal cifrado específico para tokens.

## Reglas y criterios de aceptación

- **AC-1:** Negocio, notificación y referencia outbox se confirman juntos. Fallo SMTP no revierte negocio; reintento durable con presupuesto.
- **AC-2:** Eventos tipados estrictos limitan campos; definir destinatarios institucionales de todos los productores, no sólo los actuales.
- **AC-3:** Claims/renovación/recibos/publicación del dispatcher deben revalidar época/barrera y lease vigente al efecto. SMTP externo no ofrece exactamente-una-entrega.
- **AC-4:** `verify()` sólo prueba conectividad; heartbeat sólo ciclo. Correo entregado requiere evidencia aparte. Leer notificación no equivale a acuse de biblioteca.

## Diseño y evidencia

- [Contratos](../../../backend/src/common/domain/operational-notification.ts), [outbox](../../../backend/src/auth/outbox.service.ts), [dispatcher](../../../backend/src/auth/outbox-dispatcher.service.ts).
- [Notificaciones](../../../backend/src/notifications/), [UI](../../../frontend/app/portal/notificaciones/), [SMTP real](../../../backend/test/integration/operational-mail.integration.test.ts).
- Desde el 26/10 el claim, la preparación del intento, el recibo `SENT`/`FAILED` y `markSent`/`markFailure` se confirman bajo la barrera y en la época del claim (`withWorkerWriteBarrier`), con lease vivo exigido antes de enviar; `SENT` exige sólo el mismo dueño, para no duplicar si el lease venció sin reclamarse. Congelar durante el envío deja el evento arrendado hasta que otro dispatcher lo retome tras el unfreeze.
- Límite: un envío ya hecho cuyo recibo no pudo confirmarse puede reenviarse; el `Message-ID` estable sólo ayuda a reconciliar en el receptor.
- Message-ID estable ayuda a reconciliar, no garantiza deduplicación del receptor. Perder respuesta SMTP deja resultado incierto.

## Tareas y pendientes

- [x] **T1 · código · AC-1/2/4:** Avisos tipados de múltiples dominios, outbox privado y entrega genérica existentes.
- [x] **T2 · código · AC-3:** Lifecycle de outbox/EmailDelivery por época y lease ([dispatcher](../../../backend/src/auth/outbox-dispatcher.service.ts), [pruebas](../../../backend/test/unit/auth/operational-delivery.test.ts)); validado con mocks, dos dispatchers reales en T4.
- [ ] **T3 · código · AC-2:** Inventariar productores restantes y cobertura de avisos de seguridad/vencimiento/resolución, con schemas estrictos.
- [ ] **T4 · validación · AC-1/3/4:** SMTP lento/rechazado/respuesta perdida y dos dispatchers contra base/SMTP sintéticos.
- [ ] **T5 · externo · AC-2:** Aprobar destinatarios y canales institucionales sin inventar autoridades ni correos.

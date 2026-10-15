# Nombre de feature

ID: `slug` · Estado: propuesta · Revisión: AAAA-MM-DD

## Objetivo y alcance

Resultado para el usuario y exclusiones. Dependencias mediante enlaces a otras features.

## Reglas y criterios de aceptación

- **AC-1:** Dado un contexto y permiso, una acción produce un resultado observable.
- **AC-2:** Reintento, falta de permiso y fallo de dependencia conservan las invariantes relevantes.

## Diseño y evidencia

- Enlaces a servicio/controlador, UI, modelo/migración, contrato y pruebas existentes.
- Describir sólo decisiones necesarias; distinguir código existente de diseño pendiente.
- Gate: comando, fecha, resultado y límites; si no se ejecutó, decirlo expresamente.

## Tareas y pendientes

- [ ] **T1 · código · AC-1:** Resultado pequeño comprobable.
- [ ] **T2 · validación · AC-1/2:** Pruebas y aceptación del recorrido.
- [ ] **T3 · externo · AC-1:** Decisión o infraestructura necesaria, sin inventar aprobador ni plazo.

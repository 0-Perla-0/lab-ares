"use client";
import { useCallback, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { Modal } from "@/components/ui/primitives";
import {
  actionClass,
  DomainFeedback,
  DomainInput,
  useDomainAction,
} from "./domain-ui";
export function ContingencyForm({
  reload,
}: {
  reload: () => Promise<unknown>;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const action = useDomainAction(user.id, async () => {
    setOpen(false);
    await reload();
  });
  const close = useCallback(() => {
    if (!action.busy) setOpen(false);
  }, [action.busy]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void action.send("/api/attendance/contingency", {
      userId: Number(form.get("userId")),
      date: form.get("date"),
      checkInAt: new Date(String(form.get("start"))).toISOString(),
      checkOutAt: new Date(String(form.get("end"))).toISOString(),
      ticket: form.get("ticket"),
      reason: form.get("reason"),
      justification: form.get("justification"),
    });
  }
  return (
    <>
      <button className={actionClass} onClick={() => setOpen(true)}>
        Capturar asistencia por contingencia
      </button>
      {!open && <DomainFeedback action={action} />}
      <Modal
        open={open}
        onClose={close}
        title="Asistencia por contingencia"
        description="Horas pendientes; una jefatura distinta del capturista deberá validarlas. Las horas se muestran en la zona local de tu dispositivo; el backend verifica el día en México."
      >
        <DomainFeedback action={action} />
        <form onSubmit={submit} className="space-y-3">
          <fieldset disabled={action.disabled} className="space-y-3">
            <DomainInput
              name="userId"
              label="ID del prestador"
              type="number"
              min={1}
            />
            <DomainInput
              name="date"
              label="Fecha reportada en México"
              type="date"
            />
            <DomainInput
              name="start"
              label="Entrada reportada"
              type="datetime-local"
            />
            <DomainInput
              name="end"
              label="Salida reportada"
              type="datetime-local"
            />
            <DomainInput
              name="ticket"
              label="Referencia externa del ticket"
              maxLength={150}
            />
            <DomainInput
              name="reason"
              label="Motivo (mínimo 5 caracteres)"
              maxLength={500}
            />
            <DomainInput
              name="justification"
              label="Justificación (mínimo 10 caracteres)"
              maxLength={1000}
            />
            <button className={actionClass}>Confirmar captura pendiente</button>
          </fieldset>
        </form>
      </Modal>
    </>
  );
}

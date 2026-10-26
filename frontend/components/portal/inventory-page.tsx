"use client";
import { useCallback, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import {
  Field,
  ForbiddenState,
  Modal,
  PageHeader,
  StatusBadge,
  inputClassName,
} from "@/components/ui/primitives";
import { hasPermission, permissions } from "@/lib/permissions";
import {
  actionClass,
  DomainFeedback,
  DomainInput,
  ReadFeedback,
  useDomainAction,
  useDomainData,
} from "./domain-ui";
type Item = {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
  cantidadStock: string;
  unidadMedida: string | null;
  estadoActivo: string | null;
  version: number;
  stockBajo: boolean;
  ubicacion: { nombre: string };
};
type Loan = {
  id: string;
  articulo: { nombre: string };
  solicitante: { codigo: string };
  solicitanteId: number;
  fechaLimite: string;
  estado: string;
};
type Location = { id: number; nombre: string };
type Page<T> = { items: T[]; nextCursor: string | null };
export function InventoryPage() {
  const { user } = useAuth();
  const allowed = hasPermission(user, permissions.INVENTORY_READ),
    manage = hasPermission(user, permissions.INVENTORY_MANAGE),
    lend = hasPermission(user, permissions.INVENTORY_LOAN);
  const newWorkEnabled = user.capabilities?.["INVENTORY.MOVEMENT"] !== false;
  const [cursor, setCursor] = useState<string | null>(null);
  const [locationId, setLocationId] = useState("");
  const [loanCursor, setLoanCursor] = useState<string | null>(null);
  const [borrower, setBorrower] = useState("");
  const [overdue, setOverdue] = useState(false);
  const [modal, setModal] = useState<{
    kind: "movement" | "loan" | "return";
    item?: Item;
    loan?: Loan;
  } | null>(null);
  const [type, setType] = useState("CONSUMIBLE");
  const [ledgerId, setLedgerId] = useState<string | null>(null);
  const locations = useDomainData<Location[]>(
    allowed ? "/api/inventory/locations" : null,
  );
  const items = useDomainData<Page<Item>>(
    allowed
      ? `/api/inventory/items?limit=20${cursor ? `&cursor=${cursor}` : ""}${locationId ? `&ubicacionId=${locationId}` : ""}`
      : null,
  );
  const loans = useDomainData<Page<Loan>>(
    allowed
      ? `/api/inventory/loans?limit=20&estado=ACTIVO&vencidos=${overdue}${loanCursor ? `&cursor=${loanCursor}` : ""}${borrower ? `&solicitanteId=${borrower}` : ""}`
      : null,
  );
  const ledger = useDomainData<{
    items: { id: string; tipo: string; cantidad: string; motivo: string }[];
    ledgerBalance: string;
  }>(ledgerId ? `/api/inventory/items/${ledgerId}/movements?limit=100` : null);
  const action = useDomainAction(user.id, async () => {
    setModal(null);
    await Promise.all([
      items.load(),
      loans.load(),
      locations.load(),
      ledger.load(),
    ]);
  });
  const close = useCallback(() => {
    if (!action.busy) setModal(null);
  }, [action.busy]);
  function createLocation(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void action.send("/api/inventory/locations", {
      sedeId: Number(f.get("sedeId")),
      ...(f.get("areaId") ? { areaId: Number(f.get("areaId")) } : {}),
      nombre: f.get("name"),
      codigo: f.get("code"),
      reason: f.get("reason"),
    });
  }
  function createItem(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void action.send("/api/inventory/items", {
      codigo: f.get("code"),
      nombre: f.get("name"),
      tipo: type,
      ubicacionId: Number(f.get("location")),
      ...(type === "CONSUMIBLE"
        ? {
            unidadMedida: f.get("unit"),
            umbralMinimo: Number(f.get("minimum")),
          }
        : {}),
      reason: f.get("reason"),
    });
  }
  function modalSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!modal) return;
    const f = new FormData(e.currentTarget);
    if (modal.kind === "return")
      void action.send(`/api/inventory/loans/${modal.loan!.id}/return`, {
        estadoFisico: f.get("condition"),
        motivo: f.get("reason"),
      });
    else if (modal.kind === "loan")
      void action.send("/api/inventory/loans", {
        articuloId: modal.item!.id,
        version: modal.item!.version,
        solicitanteId: Number(f.get("borrower")),
        fechaLimite: new Date(String(f.get("due"))).toISOString(),
        motivo: f.get("reason"),
      });
    else
      void action.send("/api/inventory/movements", {
        articuloId: modal.item!.id,
        version: modal.item!.version,
        tipo: f.get("movement"),
        cantidad: Number(f.get("quantity")),
        motivo: f.get("reason"),
      });
  }
  if (!allowed) return <ForbiddenState />;
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Servicios complementarios"
        title="Inventario operativo"
        description="Stock derivado de movimientos inmutables. Sin compras ni finanzas; activos individuales con devolución revisada."
      />
      {!modal && <DomainFeedback action={action} />}
      {manage && newWorkEnabled && (
        <>
          <details>
            <summary className={actionClass}>Crear ubicación</summary>
            <form onSubmit={createLocation}>
              <fieldset
                disabled={action.disabled}
                className="grid gap-3 sm:grid-cols-2"
              >
                <DomainInput
                  name="sedeId"
                  label="ID sede"
                  type="number"
                  min={1}
                  defaultValue={user.sedeId ?? undefined}
                />
                <DomainInput
                  name="areaId"
                  label="ID área"
                  type="number"
                  min={1}
                  required={false}
                  defaultValue={user.areaId ?? undefined}
                />
                <DomainInput
                  name="name"
                  label="Nombre de ubicación"
                  maxLength={100}
                />
                <DomainInput
                  name="code"
                  label="Código de ubicación"
                  maxLength={50}
                />
                <DomainInput
                  name="reason"
                  label="Motivo del alta"
                  maxLength={500}
                />
                <button className={actionClass}>Confirmar ubicación</button>
              </fieldset>
            </form>
          </details>
          <details>
            <summary className={actionClass}>Dar de alta artículo</summary>
            <form onSubmit={createItem}>
              <fieldset
                disabled={action.disabled}
                className="grid gap-3 sm:grid-cols-2"
              >
                <DomainInput
                  name="code"
                  label="Código único de inventario / serie"
                  maxLength={60}
                />
                <DomainInput
                  name="name"
                  label="Nombre del artículo"
                  maxLength={150}
                />
                <Field label="Tipo">
                  <select
                    value={type}
                    className={inputClassName}
                    onChange={(e) => setType(e.target.value)}
                  >
                    <option>CONSUMIBLE</option>
                    <option>ACTIVO</option>
                  </select>
                </Field>
                <Field label="Ubicación">
                  <select name="location" required className={inputClassName}>
                    <option value="">Selecciona</option>
                    {locations.data?.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.nombre}
                      </option>
                    ))}
                  </select>
                </Field>
                {type === "CONSUMIBLE" && (
                  <>
                    <DomainInput
                      name="unit"
                      label="Unidad de medida"
                      maxLength={30}
                    />
                    <DomainInput
                      name="minimum"
                      label="Umbral mínimo"
                      type="number"
                      min={0}
                      step="0.01"
                    />
                  </>
                )}
                <DomainInput
                  name="reason"
                  label="Motivo del alta de artículo"
                  maxLength={500}
                />
                <button className={actionClass}>Confirmar alta</button>
              </fieldset>
            </form>
            <p>
              Consumibles inician en cero; registra una entrada. El alta de un
              activo genera una entrada de una unidad.
            </p>
          </details>
        </>
      )}
      <ReadFeedback
        loading={locations.loading}
        error={locations.error}
        retry={() => void locations.load()}
      />
      <Field label="Filtrar por ubicación">
        <select
          value={locationId}
          className={inputClassName}
          onChange={(e) => {
            setLocationId(e.target.value);
            setCursor(null);
          }}
        >
          <option value="">Todas las autorizadas</option>
          {locations.data?.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nombre}
            </option>
          ))}
        </select>
      </Field>
      <ReadFeedback
        loading={items.loading}
        error={items.error}
        retry={() => void items.load()}
      />
      {items.data && !items.data.items.length && (
        <p>No hay artículos en esta página.</p>
      )}
      <ul className="space-y-3">
        {items.data?.items.map((item) => (
          <li
            key={item.id}
            className="space-y-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
          >
            <h2 className="font-bold">
              {item.codigo} · {item.nombre}
            </h2>
            <p>
              {item.ubicacion.nombre} · {item.tipo} · Stock {item.cantidadStock}{" "}
              {item.unidadMedida}
            </p>
            {item.stockBajo && (
              <StatusBadge label="Stock bajo" tone="warning" />
            )}
            {item.estadoActivo && <StatusBadge label={item.estadoActivo} />}
            {manage && newWorkEnabled && item.tipo === "CONSUMIBLE" && (
              <button
                disabled={action.disabled}
                className={actionClass}
                onClick={() => setModal({ kind: "movement", item })}
              >
                Registrar movimiento de {item.nombre}
              </button>
            )}
            {lend && newWorkEnabled && item.estadoActivo === "DISPONIBLE" && (
              <button
                disabled={action.disabled}
                className={actionClass}
                onClick={() => setModal({ kind: "loan", item })}
              >
                Prestar {item.nombre}
              </button>
            )}
            <button
              className={actionClass}
              onClick={() => setLedgerId(item.id)}
            >
              Ver libro mayor de {item.nombre}
            </button>
          </li>
        ))}
      </ul>
      <button
        className={actionClass}
        disabled={!cursor || items.loading}
        onClick={() => setCursor(null)}
      >
        Primera página de artículos
      </button>
      <button
        className={actionClass}
        disabled={!items.data?.nextCursor || items.loading}
        onClick={() => setCursor(items.data!.nextCursor)}
      >
        Siguiente página de artículos
      </button>
      {ledgerId && (
        <section aria-label="Libro mayor">
          <h2 className="font-bold">Libro mayor (últimos 100 movimientos)</h2>
          <ReadFeedback
            loading={ledger.loading}
            error={ledger.error}
            retry={() => void ledger.load()}
          />
          <p>Saldo del libro: {ledger.data?.ledgerBalance}</p>
          <ul>
            {ledger.data?.items.map((m) => (
              <li key={m.id}>
                {m.tipo} · {m.cantidad} · {m.motivo}
              </li>
            ))}
          </ul>
        </section>
      )}
      <h2 className="text-xl font-bold">Préstamos activos</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setBorrower(String(new FormData(e.currentTarget).get("borrower")));
          setLoanCursor(null);
        }}
      >
        <DomainInput
          name="borrower"
          label="ID prestador (opcional)"
          type="number"
          min={1}
          required={false}
        />
        <button className={actionClass}>Filtrar préstamos</button>
      </form>
      <label>
        <input
          type="checkbox"
          checked={overdue}
          onChange={(e) => {
            setOverdue(e.target.checked);
            setLoanCursor(null);
          }}
        />{" "}
        Sólo vencidos a la fecha actual
      </label>
      <ReadFeedback
        loading={loans.loading}
        error={loans.error}
        retry={() => void loans.load()}
      />
      {loans.data && !loans.data.items.length && (
        <p>No hay préstamos activos en esta página.</p>
      )}
      <ul className="space-y-3">
        {loans.data?.items.map((loan) => (
          <li
            key={loan.id}
            className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
          >
            <p>
              {loan.articulo.nombre} · {loan.solicitante.codigo} · límite{" "}
              {new Date(loan.fechaLimite).toLocaleString()}
            </p>
            {lend && (
              <button
                className={actionClass}
                disabled={action.disabled}
                onClick={() => setModal({ kind: "return", loan })}
              >
                Registrar devolución de {loan.articulo.nombre}
              </button>
            )}
          </li>
        ))}
      </ul>
      <button
        className={actionClass}
        disabled={!loanCursor || loans.loading}
        onClick={() => setLoanCursor(null)}
      >
        Primera página de préstamos
      </button>
      <button
        className={actionClass}
        disabled={!loans.data?.nextCursor || loans.loading}
        onClick={() => setLoanCursor(loans.data!.nextCursor)}
      >
        Siguiente página de préstamos
      </button>
      <Modal
        open={!!modal}
        onClose={close}
        title={
          modal?.kind === "return"
            ? "Devolución con revisión física"
            : modal?.kind === "loan"
              ? "Préstamo de activo"
              : "Movimiento inmutable"
        }
      >
        <DomainFeedback action={action} />
        <form onSubmit={modalSubmit}>
          <fieldset disabled={action.disabled} className="space-y-3">
            {modal?.kind === "movement" && (
              <>
                <Field label="Tipo de movimiento">
                  <select name="movement" className={inputClassName}>
                    <option>ENTRADA</option>
                    <option>SALIDA</option>
                    <option>AJUSTE</option>
                  </select>
                </Field>
                <DomainInput
                  name="quantity"
                  label="Cantidad (ajuste: delta con signo)"
                  type="number"
                  step="0.01"
                />
              </>
            )}
            {modal?.kind === "loan" && (
              <>
                <DomainInput
                  name="borrower"
                  label="ID del receptor del préstamo"
                  type="number"
                  min={1}
                />
                <DomainInput
                  name="due"
                  label="Fecha límite (zona local del dispositivo)"
                  type="datetime-local"
                />
              </>
            )}
            {modal?.kind === "return" && (
              <Field label="Estado físico revisado">
                <select name="condition" className={inputClassName}>
                  {["DISPONIBLE", "EN_MANTENIMIENTO", "DANIADO", "BAJA"].map(
                    (s) => (
                      <option key={s}>{s}</option>
                    ),
                  )}
                </select>
              </Field>
            )}
            <DomainInput
              name="reason"
              label="Motivo / revisión física"
              maxLength={500}
            />
            <button className={actionClass}>
              Confirmar operación de inventario
            </button>
          </fieldset>
        </form>
      </Modal>
    </div>
  );
}

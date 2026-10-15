import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VisitsPage } from "@/components/portal/visits-page";
import { InventoryPage } from "@/components/portal/inventory-page";
import { AuditConsole } from "@/components/portal/audit-console";
import { OperationsConsole } from "@/components/portal/operations-console";
import { RecoveryConsole } from "@/components/portal/recovery-console";
import { DomainInput, ReadFeedback } from "@/components/portal/domain-ui";
const fixture = vi.hoisted(() => ({
  user: {
    id: 1,
    codigo: "Synthetic",
    rol: "ADMIN",
    sedeId: 1,
    areaId: 2,
    permissions: {} as Record<string, string>,
  },
}));
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => fixture }));
beforeEach(() => {
  fixture.user.permissions = {};
});
describe("operational components", () => {
  it.each([
    VisitsPage,
    InventoryPage,
    AuditConsole,
    OperationsConsole,
    RecoveryConsole,
  ])("fails closed without server grants", (Component) => {
    const markup = renderToStaticMarkup(<Component />);
    expect(markup).toContain("Acceso restringido");
    expect(markup).not.toContain("<form");
  });
  it("preparation UI never renders destructive recovery controls", () => {
    fixture.user.permissions = {
      "recovery:read": "global",
      "recovery:manage": "global",
      "recovery:execute": "global",
    };
    const markup = renderToStaticMarkup(<RecoveryConsole />);
    expect(markup).toContain("Confirmar preparación (no congela escrituras)");
    expect(markup).not.toMatch(
      />Restaurar|>Borrar|>Descongelar|>Ejecutar reconciliación/,
    );
  });
  it("staff lookup explicitly separates QR identification from authorization", () => {
    fixture.user.permissions = { "visits:control": "area" };
    const markup = renderToStaticMarkup(<VisitsPage control />);
    expect(markup).toContain("Código privado de visita");
    expect(markup).toContain("QR");
    expect(markup).toContain("identificación oficial");
  });
  it("inputs have associated labels and native validation", () => {
    const markup = renderToStaticMarkup(
      <DomainInput name="borrower" label="Receptor" type="number" min={1} />,
    );
    expect(markup).toContain("for=");
    expect(markup).toContain('type="number"');
    expect(markup).toContain("required");
  });
  it("read failures and loading are distinct accessible feedback", () => {
    const markup = renderToStaticMarkup(
      <ReadFeedback loading error="Error sintético" retry={() => {}} />,
    );
    expect(markup).toContain('role="status"');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Reintentar consulta");
  });
});

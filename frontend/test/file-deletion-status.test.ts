import { describe, expect, it, vi } from "vitest";
import { apiRequest } from "../lib/api";
import {
  fileScanPresentation,
  uploadPrivateFile,
} from "../lib/backend2/file-upload";

vi.mock("../lib/api", () => ({ apiRequest: vi.fn() }));

describe("reserved file deletion", () => {
  it("does not present a reserved file as available or already physically deleted", () => {
    expect(fileScanPresentation("ELIMINACION_PENDIENTE")).toEqual({
      phase: "rejected",
      stage: "RECHAZADO",
      label: "Archivo reservado para eliminación",
    });
  });
  it("stops scan polling for a reserved file", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({
      data: { id: "reserved-file", status: "ELIMINACION_PENDIENTE" },
    });
    const result = await uploadPrivateFile(
      new File(["synthetic"], "synthetic.txt"),
      { maxPolls: 0 },
    );
    expect(result.status).toBe("ELIMINACION_PENDIENTE");
    expect(apiRequest).toHaveBeenCalledOnce();
  });
});

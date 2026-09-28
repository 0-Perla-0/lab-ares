import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PasswordRecoveryForm } from "@/components/auth/password-recovery-form";

describe("password recovery", () => {
  it("starts with an accessible, non-enumerating recovery request", () => {
    const html = renderToStaticMarkup(<PasswordRecoveryForm />);

    expect(html).toContain('type="email"');
    expect(html).toContain("Si existe una cuenta con ese correo");
    expect(html).toContain("Enviar token");
  });
});

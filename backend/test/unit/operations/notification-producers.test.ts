import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  notificationContracts,
  notificationLink,
} from "../../../src/common/domain/operational-notification";

const src = join(__dirname, "../../../src");
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (path.includes(`${join("src", "generated")}`)) return [];
    return statSync(path).isDirectory()
      ? walk(path)
      : path.endsWith(".ts")
        ? [path]
        : [];
  });
}
const files = walk(src).map((path) => ({
  path: relative(src, path).replaceAll("\\", "/"),
  text: readFileSync(path, "utf8"),
}));

describe("notification producers", () => {
  it("never persists a notice whose payload skipped its strict contract", () => {
    const offenders = files.filter(
      ({ path, text }) =>
        /notification\.(create|createMany)\(/.test(text) &&
        path !== "common/domain/operational-notification.ts" &&
        !/notificationContracts\.[A-Z_]+\.parse|operationalNotification\(/.test(
          text,
        ),
    );
    expect(offenders.map((file) => file.path)).toEqual([]);
  });

  it("has at least one producer for every declared notice type", () => {
    const orphans = Object.keys(notificationContracts).filter(
      (type) =>
        !files.some(
          ({ path, text }) =>
            path !== "common/domain/operational-notification.ts" &&
            text.includes(`"${type}"`),
        ),
    );
    expect(orphans).toEqual([]);
  });

  it("rejects free text and unknown fields in identity notices", () => {
    expect(() =>
      notificationContracts.PASSWORD_CHANGED.parse({
        sessionsRevoked: true,
        password: "secret",
      }),
    ).toThrow();
    expect(() =>
      notificationContracts.SESSION_REVOKED.parse({ sessionId: "" }),
    ).toThrow();
    expect(() =>
      notificationContracts.ACCOUNT_CHANGED.parse({ sessionsRevoked: false }),
    ).toThrow();
  });

  it("sends security notices to the security page", () => {
    for (const type of [
      "PASSWORD_CHANGED",
      "PASSWORD_RECOVERED",
      "SESSION_REVOKED",
      "ACCOUNT_CHANGED",
      "MFA_ENABLED",
      "IDENTITY_TEMPORARILY_THROTTLED",
    ])
      expect(notificationLink(type)).toBe("/portal/seguridad");
  });
});

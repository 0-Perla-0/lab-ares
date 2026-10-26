import type { AuthUser } from "../../../src/auth/auth-user";

/** Transaction handle the repositories receive when a durable intent runs. */
export const tx: any = { marker: "tx" };

/** DomainTransaction stand-in: executes the effect without receipts. */
export const passthroughDomain: any = {
  run: (_actor: unknown, _key: string, _op: object, apply: (t: any) => any) =>
    apply(tx),
};

export const testActor = { id: 1, rol: "ADMIN" } as unknown as AuthUser;

/** Calls service methods that take (actor, key, ...args) with fixed identity. */
export function withIdentity<T extends object>(
  service: T,
  names: readonly (keyof T & string)[],
): any {
  const wrapped: any = Object.create(service);
  for (const name of names)
    wrapped[name] = (...args: unknown[]) =>
      (service as any)[name](testActor, "test-key-0000000001", ...args);
  return wrapped;
}

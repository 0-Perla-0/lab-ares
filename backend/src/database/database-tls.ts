import { createSecureContext, type ConnectionOptions } from "node:tls";
import { X509Certificate } from "node:crypto";

/** Never permits an insecure TLS fallback or accepts an unverified certificate. */
export function databaseTls(input: {
  enabled?: boolean | string;
  ca?: string;
  servername?: string;
}): ConnectionOptions | undefined {
  if (
    ![undefined, true, false, "true", "false", "1", "0"].includes(input.enabled)
  )
    throw new Error("Invalid DATABASE_TLS_ENABLED");
  const enabled =
    input.enabled === true || input.enabled === "true" || input.enabled === "1";
  if (!enabled) {
    if (input.ca || input.servername)
      throw new Error("Database TLS options require DATABASE_TLS_ENABLED");
    return undefined;
  }
  const options: ConnectionOptions = {
    minVersion: "TLSv1.2",
    rejectUnauthorized: true,
  };
  if (input.ca) {
    const ca = input.ca.replaceAll("\\n", "\n");
    const certificates = ca.match(
      /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,
    );
    if (
      !certificates?.length ||
      ca
        .replace(
          /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,
          "",
        )
        .trim()
    )
      throw new Error("Invalid DATABASE_TLS_CA certificate bundle");
    for (const certificate of certificates) new X509Certificate(certificate);
    options.ca = ca;
  }
  if (input.servername) options.servername = input.servername;
  // Validate trust configuration at startup, not during an ordinary request.
  createSecureContext(options);
  return options;
}

import { cache } from "react";

import type { ApiEnvelope } from "@/lib/types";
import type { PublishedPage } from "./public-content";

// Lectura de servidor para metadatos; devuelve null si no hay versión publicada o el API no responde.
export const fetchPublishedPage = cache(
  async (slug: string): Promise<PublishedPage | null> => {
    const target = process.env.API_PROXY_TARGET ?? "http://localhost:3000";
    try {
      const response = await fetch(
        `${target}/api/public-content/pages/${encodeURIComponent(slug)}`,
        { next: { revalidate: 60 } },
      );
      if (!response.ok) return null;
      return ((await response.json()) as ApiEnvelope<PublishedPage>).data;
    } catch {
      return null;
    }
  },
);

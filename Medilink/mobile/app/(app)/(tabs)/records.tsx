import React from "react";

import { ScreenPreview } from "@/dev/ScreenPreview";

/**
 * Records tab = "Me Vault" (PDF p28). The document/lab/prescription vault is built
 * in Batch 4; until then this tab shows the branded PDF-styled preview.
 */
export default function RecordsScreen() {
  return <ScreenPreview id="vault" showBack={false} />;
}

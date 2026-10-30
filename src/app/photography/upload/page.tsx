import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/access";
import { PhotographyImporter } from "@/components/photography/importer";

export const metadata: Metadata = { title: "Import photography" };
export default async function PhotographyUploadPage() {
  await requireAdmin();
  return <PhotographyImporter />;
}

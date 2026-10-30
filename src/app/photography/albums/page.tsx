import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/access";
import { PhotographyAlbums } from "@/components/photography/albums";

export const metadata: Metadata = { title: "Photography albums" };
export default async function PhotographyAlbumsPage() {
  await requireAdmin();
  return <PhotographyAlbums />;
}

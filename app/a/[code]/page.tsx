import AstaLive from "@/components/AstaLive";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <AstaLive code={String(code).toUpperCase()} />;
}

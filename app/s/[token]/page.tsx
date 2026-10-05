import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import SharedFile from "@/components/previews/shared-file";
import { CloudError } from "@/lib/server/cloud-error";
import { loginDestination, pageAuthRequest } from "@/lib/server/page-auth";
import { publicFileData } from "@/lib/server/public-links";

export const metadata: Metadata = { title: "공유된 파일 · Cloud", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function SharedFilePage({ params }: { params: Promise<{ token: string }> }) {
  const request = pageAuthRequest(new Headers(await headers()));
  let login: string | undefined;
  let file: Awaited<ReturnType<typeof publicFileData>> | undefined;
  let message = "공유 링크가 해제되었거나 파일을 찾을 수 없습니다.";
  try {
    file = await publicFileData(request, (await params).token);
  } catch (error) {
    if (!(error instanceof CloudError)) throw error;
    if (error.status === 401 || error.status === 403) login = loginDestination(request);
    else message = error.message;
  }
  if (login) redirect(login);
  if (file) return <SharedFile file={file} />;
  return <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center"><h1 className="text-xl font-semibold">파일을 열 수 없습니다</h1><p role="alert">{message}</p></main>;
}

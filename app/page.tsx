import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CloudError } from "@/lib/server/cloud-error";
import { pageAuthRequest, rootDestination } from "@/lib/server/page-auth";

export default async function Home() {
  let destination: string;
  try {
    const request = pageAuthRequest(new Headers(await headers()));
    destination = await rootDestination(request);
  } catch (error) {
    if (!(error instanceof CloudError)) throw error;
    return <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold">로그인 상태를 확인할 수 없습니다</h1>
      <p role="alert">{error.message}</p>
      <form action="/" method="get"><button type="submit" className="underline underline-offset-4">다시 시도</button></form>
    </main>;
  }
  // Next redirect throws internally; keep it outside the error handler.
  redirect(destination);
}

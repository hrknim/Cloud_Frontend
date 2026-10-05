import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CloudError } from "@/lib/server/cloud-error";
import { pageAuthRequest, rootDestination as pageDestination } from "@/lib/server/page-auth";
import Drive from "@/components/drive/drive";
import Layout from "@/components/auth/layout";
import { GetCurrentLanguage } from "@/lib/global";
import { DriveSearch, DriveSearchProvider } from "@/components/drive/drive-search";
import styles from "@/components/drive/drive.module.css";

export const metadata: Metadata = {
  title: "내 드라이브 · Cloud",
  description: "우리만의 작은 공간. 3D 작업과 이미지를 한곳에서 관리하세요.",
};

export default async function DrivePage() {
  let destination: string;
  try {
    destination = await pageDestination(pageAuthRequest(new Headers(await headers())));
  } catch (error) {
    if (!(error instanceof CloudError)) throw error;
    return <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold">로그인 상태를 확인할 수 없습니다</h1>
      <p role="alert">{error.message}</p>
      <form action="/drive" method="get"><button type="submit" className="underline underline-offset-4">다시 시도</button></form>
    </main>;
  }
  // Do not redirect an authenticated request back to /drive itself.
  if (destination !== "/drive") redirect(destination);
  const translate = await GetCurrentLanguage();
  return (
    <DriveSearchProvider>
      <Layout
        translate={translate}
        hideSearchbar={false}
        searchbar={<DriveSearch />}
        mainClassName={styles.layoutMain}
        className={styles.driveLayout}
      >
        <Drive />
      </Layout>
    </DriveSearchProvider>
  );
}

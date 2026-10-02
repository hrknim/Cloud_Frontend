import type { Metadata } from "next";
import Drive from "./drive";
import Layout from "@/components/auth/layout";
import { GetCurrentLanguage } from "@/lib/global";
import { DriveSearch, DriveSearchProvider } from "./drive-search";
import styles from "./drive.module.css";

export const metadata: Metadata = {
  title: "내 드라이브 · Cloud",
  description: "우리만의 작은 공간. 3D 작업과 이미지를 한곳에서 관리하세요.",
};

export default async function DrivePage() {
  const translate = await GetCurrentLanguage();
  return (
    <DriveSearchProvider>
      <Layout
        translate={translate}
        hideSearchbar={false}
        searchbar={<DriveSearch />}
        mainClassName={styles.layoutMain}
      >
        <Drive />
      </Layout>
    </DriveSearchProvider>
  );
}

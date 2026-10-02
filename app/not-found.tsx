import Layout from '@/components/auth/layout';
import { GetCurrentLanguage } from '@/lib/global'
export default async function PageNotFound() {
  const translate = await GetCurrentLanguage();
  return (
    <Layout translate={translate} hideSearchbar={false} >
      <div>잘못된 페이지입니다.</div>
    </Layout>
  )
}

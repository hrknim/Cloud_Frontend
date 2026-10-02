import { redirect } from 'next/navigation';

export default async function Home() {
  const userdata = true //await GetSessionUserData();
  if (!userdata) {
    redirect(`${'auth server here'}/login`);
  } else {
    redirect(`/drive`);
  }
}

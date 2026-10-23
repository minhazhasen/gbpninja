import { ProfileBoard } from "@/components/profile/profile-board";
import { getProvider } from "@/lib/gbp";

export default async function ProfilePage() {
  const provider = await getProvider();
  const [me, locations] = await Promise.all([provider.getCurrentMember(), provider.listLocations()]);
  return <ProfileBoard me={{ ...me, inviteToken: null }} locations={locations.map(({ id, title, address }) => ({ id, title, address }))} />;
}

import { UsersBoard } from "@/components/users/users-board";
import { getProvider } from "@/lib/gbp";

export default async function UsersPage() {
  const provider = await getProvider();
  const [members, me, locations] = await Promise.all([provider.listMembers(), provider.getCurrentMember(), provider.listLocations()]);
  return (
    <UsersBoard
      // Invite tokens are secrets: only admins get them (to copy links).
      members={me.role === "admin" ? members : members.map((m) => ({ ...m, inviteToken: null }))}
      meId={me.id}
      isAdmin={me.role === "admin"}
      locations={locations.map(({ id, title }) => ({ id, title }))}
    />
  );
}

import { FriendProfileClient } from "./FriendProfileClient";
export default async function FriendProfilePage({ params }: { params: Promise<{ userId: string }> }) {
  return <FriendProfileClient userId={(await params).userId} />;
}

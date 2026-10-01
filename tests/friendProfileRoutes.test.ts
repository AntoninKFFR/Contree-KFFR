import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth:vi.fn(),rpc:vi.fn(),client:vi.fn() }));
vi.mock("server-only",()=>({}));
vi.mock("@supabase/supabase-js",()=>({ createClient:mocks.client }));
vi.mock("@/lib/server/supabaseAdmin",()=>({ authenticatedUserId:mocks.auth }));
import { GET } from "@/app/api/social/friends/[userId]/profile/route";
const id="22222222-2222-4222-8222-222222222222";
const profile={userId:id,username:"Benjamin",level:1,equipped:{title:null,badge:null,frame:null},solo:{games:0,wins:0,losses:0,winrate:0},multiplayer:{games:0,wins:0,losses:0,winrate:0},rating:null};
const request=()=>new Request("http://localhost/api/social/friends/"+id+"/profile",{headers:{Authorization:"Bearer jwt"}});
const context=(userId=id)=>({params:Promise.resolve({userId})});
beforeEach(()=>{vi.clearAllMocks();process.env.NEXT_PUBLIC_SUPABASE_URL="https://example.supabase.co";process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="key";mocks.auth.mockResolvedValue("actor");mocks.client.mockReturnValue({rpc:mocks.rpc});mocks.rpc.mockResolvedValue({data:profile,error:null});});
it("returns minimal no-store summary using caller JWT",async()=>{
  mocks.rpc.mockResolvedValue({data:{...profile,totalXp:100,unlocks:["private"]},error:null});
  const response=await GET(request(),context());expect(response.status).toBe(200);expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await response.json()).toEqual({data:profile});expect(mocks.rpc).toHaveBeenCalledWith("get_friend_profile",{p_friend_id:id});
  expect(mocks.client).toHaveBeenCalledWith(expect.anything(),expect.anything(),expect.objectContaining({global:{headers:{Authorization:"Bearer jwt"}}}));
});
it("rejects anonymous and malformed UUID before RPC",async()=>{
  mocks.auth.mockRejectedValue(new Error("Authentication required."));expect((await GET(new Request("http://localhost"),context())).status).toBe(401);
  expect((await GET(request(),context("wrong"))).status).toBe(400);expect(mocks.rpc).not.toHaveBeenCalled();
});
it("maps all inaccessible friends to a generic controlled response",async()=>{
  mocks.rpc.mockResolvedValue({data:null,error:{code:"P0001",message:"friend_profile_unavailable"}});
  const response=await GET(request(),context());expect(response.status).toBe(404);expect(await response.json()).toEqual({error:"Ce profil n’est pas disponible.",code:"friend_profile_unavailable"});
});
it("fails closed on unavailable DB or invalid RPC payload",async()=>{
  vi.spyOn(console,"error").mockImplementation(()=>{});
  mocks.rpc.mockRejectedValue(new Error("private database unavailable"));expect((await GET(request(),context())).status).toBe(500);
  mocks.rpc.mockResolvedValue({data:{...profile,level:0},error:null});expect((await GET(request(),context())).status).toBe(502);
});

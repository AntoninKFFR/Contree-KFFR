import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getProgression } from "../lib/progression/formulaV1";
const samples = new Set([0,99,100,224,225,Number.MAX_SAFE_INTEGER]);
for (const level of [5,10,20,40,100,1000,100000,1000000,20000000]) {
  const threshold = Number(BigInt(25) * BigInt(level-1) * BigInt(level+6) / BigInt(2));
  for (const delta of [-1,0,1]) samples.add(threshold+delta);
}
const dir = mkdtempSync(join(tmpdir(), "friend-profile-formula-"));
try {
  const file = join(dir, "formula.sql");
  const values = [...samples].map(xp => `(${xp}::bigint,${getProgression(xp).level})`).join(",");
  writeFileSync(file, `do $$ declare sample record; begin for sample in select * from (values ${values}) v(xp,level) loop if private.progression_level_from_total_xp(sample.xp)<>sample.level then raise exception 'TS/SQL mismatch at %',sample.xp;end if; end loop;end $$;`);
  execFileSync("supabase", ["db","query","--local","--file",file], { stdio:"inherit" });
} finally { rmSync(dir, { recursive:true, force:true }); }
console.log(`Friend level SQL agrees with getProgression on ${samples.size} exact boundary/high XP samples.`);

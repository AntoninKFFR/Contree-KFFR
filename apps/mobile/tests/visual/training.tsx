import { TrainingProvider } from "../../src/training/provider";
import { TrainingCatalogue } from "../../src/training/hub";
import Exercise from "../../src/app/(connected)/training/[axis]";
import { useAccount } from "./account";
export function NativeTraining({ axis }: { axis?: string }) {
  const { session } = useAccount();
  return session ? <TrainingProvider key={session.user.id} userId={session.user.id}>{axis ? <Exercise key={axis} /> : <TrainingCatalogue />}</TrainingProvider> : null;
}

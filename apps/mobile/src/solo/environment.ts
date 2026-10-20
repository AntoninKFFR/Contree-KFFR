import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomUUID } from "expo-crypto";
const timedFetch: typeof fetch = async (...args) => {
  const started = Date.now();
  try { return await fetch(...args); }
  finally {
    // Development-only timings, without URL, identity, card, payload or token.
    if (__DEV__) console.debug(`[Solo HTTP] ${Date.now() - started} ms`);
  }
};
export const soloEnvironment = { storage: AsyncStorage, fetcher: timedFetch, uuid: randomUUID };

import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomUUID } from "expo-crypto";
export const soloEnvironment = { storage: AsyncStorage, fetcher: fetch, uuid: randomUUID };

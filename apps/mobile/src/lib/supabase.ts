import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fetchWithTimeout } from "./fetchWithTimeout";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * SDK autonome : seul le publishable key public est autorisé dans le bundle.
 * AsyncStorage garde la session entre les ouvertures d'Expo Go. Avant une release
 * App Store, migrer la persistance vers un stockage chiffré (SecureStore + chiffrement).
 */
export const supabase: SupabaseClient | null =
  url?.startsWith("https://") && !url.includes("YOUR_") && key?.startsWith("sb_publishable_")
    ? createClient(url, key, {
        global: { fetch: fetchWithTimeout },
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      })
    : null;

import { supabase } from "./supabase";

function usernameToEmail(username: string) {
  return `${username.trim().toLowerCase()}@taskflow.local`;
}

export async function register(
  username: string,
  password: string
) {
  return await supabase.auth.signUp({
    email: usernameToEmail(username),
    password,
  });
}

export async function login(
  username: string,
  password: string
) {
  return await supabase.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });
}

export async function logout() {
  return await supabase.auth.signOut();
}

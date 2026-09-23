import { useQuery } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext } from "react";
import { profileQuery } from "../api/queries";
import type { Profile } from "../schema/profile";

// プロフィールはアプリで1つ。描画の中から読めるようにして、呼び出し側に持ち回らせない。
// 提供元が無い場所(テストなど)では undefined になり、今までどおり何も足さない
const ProfileContext = createContext<Profile | null | undefined>(undefined);

export const useProfileValue = (): Profile | null | undefined =>
  useContext(ProfileContext);

export const ProfileProvider = ({ children }: { children: ReactNode }) => {
  const profile = useQuery(profileQuery);
  return (
    <ProfileContext.Provider value={profile.data?.profile}>
      {children}
    </ProfileContext.Provider>
  );
};

import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";
import { startVectorIndex, vectorStatusQuery } from "../api/queries";
import { SearchDialog } from "./SearchDialog";

// 検索の窓は枠(AppShell)に1つだけ持ち、各画面の見出しの Search のボタンはそれを開く
const OpenSearchContext = createContext<(() => void) | null>(null);

export const SearchProvider = ({ children }: { children: ReactNode }) => {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  // 開くときに、足りない区切りのベクトルを作り始めてもらう(ベクトル検索。180)
  const openSearch = useCallback(() => {
    setOpen(true);
    void startVectorIndex().then((status) => {
      if (status) queryClient.setQueryData(vectorStatusQuery.queryKey, status);
    });
  }, [queryClient]);
  return (
    <OpenSearchContext.Provider value={openSearch}>
      {children}
      <SearchDialog open={open} onClose={() => setOpen(false)} />
    </OpenSearchContext.Provider>
  );
};

// 窓を開く関数。枠の外(画面だけを描くテストなど)では null
export const useOpenSearch = (): (() => void) | null =>
  useContext(OpenSearchContext);

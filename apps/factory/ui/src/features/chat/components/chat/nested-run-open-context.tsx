import { createContext, useContext } from "react";

const NestedRunOpenContext = createContext<
  ((runId: string) => void) | undefined
>(undefined);

export function NestedRunOpenProvider({
  onOpen,
  children,
}: {
  children: React.ReactNode;
  onOpen?: (runId: string) => void;
}) {
  return (
    <NestedRunOpenContext.Provider value={onOpen}>
      {children}
    </NestedRunOpenContext.Provider>
  );
}

export function useNestedRunOpen() {
  return useContext(NestedRunOpenContext);
}

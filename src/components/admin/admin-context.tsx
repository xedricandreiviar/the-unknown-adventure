import { createContext, useContext } from "react";

type AdminContextValue = { userId: string };

export const AdminContext = createContext<AdminContextValue | null>(null);

export function useAdmin(): AdminContextValue {
  const value = useContext(AdminContext);
  if (!value) throw new Error("useAdmin must be used inside the admin layout.");
  return value;
}

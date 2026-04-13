import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import api from "../api";

const STORAGE_KEY = "selectedAccountId";
const AccountContext = createContext(null);

export function AccountProvider({ children }) {
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [unmappedCount, setUnmappedCount] = useState(0);

  const setAndPersistAccount = useCallback((account) => {
    if (account) {
      localStorage.setItem(STORAGE_KEY, account.id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    setSelectedAccount(account);
  }, []);

  const fetchAccounts = useCallback(async () => {
    const { data } = await api.get("/accounts");
    setAccounts(data);
    if (data.length > 0) {
      const savedId = localStorage.getItem(STORAGE_KEY);
      const restored = savedId ? data.find((a) => a.id === savedId) : null;
      setSelectedAccount((prev) => prev ?? restored ?? data[0]);
    }
  }, []);

  // Auto-fetch accounts on mount so any page works after a direct navigation or refresh.
  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  // Refresh the unmapped-transaction badge count for the active account.
  // Call this from any page that changes categorisation state.
  const fetchUnmappedCount = useCallback(async () => {
    if (!selectedAccount) { setUnmappedCount(0); return; }
    try {
      const { data } = await api.get(
        `/accounts/${selectedAccount.id}/transactions`,
        { params: { unmapped_only: true } }
      );
      setUnmappedCount(data.length);
    } catch {
      setUnmappedCount(0);
    }
  }, [selectedAccount]);

  // Auto-refresh whenever the active account changes
  useEffect(() => { fetchUnmappedCount(); }, [fetchUnmappedCount]);

  return (
    <AccountContext.Provider
      value={{
        accounts,
        selectedAccount,
        setSelectedAccount: setAndPersistAccount,
        fetchAccounts,
        setAccounts,
        unmappedCount,
        fetchUnmappedCount,
      }}
    >
      {children}
    </AccountContext.Provider>
  );
}

export const useAccounts = () => useContext(AccountContext);

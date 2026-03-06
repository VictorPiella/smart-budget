import React, { createContext, useContext, useState, useCallback } from "react";
import api from "../api";

const STORAGE_KEY = "selectedAccountId";
const AccountContext = createContext(null);

export function AccountProvider({ children }) {
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);

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

  return (
    <AccountContext.Provider
      value={{ accounts, selectedAccount, setSelectedAccount: setAndPersistAccount, fetchAccounts, setAccounts }}
    >
      {children}
    </AccountContext.Provider>
  );
}

export const useAccounts = () => useContext(AccountContext);

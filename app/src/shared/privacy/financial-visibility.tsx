import { createContext, useContext, useState, type ReactNode } from 'react';
const VisibilityContext = createContext({ visible: true, toggle: () => {} });
export function FinancialVisibilityProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(true);
  return (
    <VisibilityContext.Provider value={{ visible, toggle: () => setVisible((v) => !v) }}>
      <div data-values-hidden={!visible || undefined}>{children}</div>
    </VisibilityContext.Provider>
  );
}
export const useFinancialVisibility = () => useContext(VisibilityContext);

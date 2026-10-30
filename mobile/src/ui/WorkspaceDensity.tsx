import { createContext, useContext } from 'react';
export const WorkspaceDensity = createContext(false);
export const useCompactWorkbench = () => useContext(WorkspaceDensity);

import { createContext, useContext } from 'react';
export const WorkspaceDensity = createContext(false);
export const useCompactWorkbench = () => useContext(WorkspaceDensity);

/** Dense tool controls are scoped to the image canvas, not navigation or object lists. */
export const DenseToolControls = createContext(false);
export const useDenseToolControls = () => useContext(DenseToolControls);

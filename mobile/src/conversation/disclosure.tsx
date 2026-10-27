import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
const DisclosureContext = createContext<Map<string, boolean> | null>(null);
/** Session-scoped choices survive virtualized row recycling, never leak into other conversations. */
export function ConversationDisclosure({ children }: { children: ReactNode }) {
  const choices = useRef(new Map<string, boolean>());
  return <DisclosureContext.Provider value={choices.current}>{children}</DisclosureContext.Provider>;
}
export function useDisclosure(id: string, initial: boolean) {
  const choices = useContext(DisclosureContext);
  const [choice, setChoice] = useState<boolean | undefined>(() => choices?.get(id));
  return [choice ?? initial, (value: boolean) => { choices?.set(id, value); setChoice(value); }] as const;
}

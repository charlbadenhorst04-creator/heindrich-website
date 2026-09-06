import { create } from "zustand";

interface MascotState {
  // Incremented every time something worth celebrating happens (e.g. an
  // item is added to the cart). MascotAssistant watches this value and
  // plays a short celebration animation whenever it changes.
  celebrationTick: number;
  celebrate: () => void;
}

export const useMascotStore = create<MascotState>((set) => ({
  celebrationTick: 0,
  celebrate: () => set((s) => ({ celebrationTick: s.celebrationTick + 1 })),
}));

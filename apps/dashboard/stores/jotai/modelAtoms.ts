import { atom } from "jotai";
import type { AssistantModel } from "./assistantAtoms";

export const modelAtom = atom<AssistantModel>("chat");

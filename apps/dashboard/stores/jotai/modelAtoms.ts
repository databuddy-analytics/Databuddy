import { atom } from "jotai";
import type { AssistantModel } from "@/app/(main)/websites/[id]/assistant/types/model";

export const modelAtom = atom<AssistantModel>("chat");

import { atom } from "jotai";

export const isFlagSheetOpenAtom = atom<boolean>(false);
export const isGroupSheetOpenAtom = atom<boolean>(false);
export const selectedFolderAtom = atom<string | null>(null);
export const collapsedFoldersAtom = atom<Set<string>>(new Set<string>());

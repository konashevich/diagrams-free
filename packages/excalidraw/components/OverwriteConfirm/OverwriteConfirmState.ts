import { atom, editorJotaiStore } from "../../editor-jotai";

import type React from "react";

export type OverwriteConfirmState =
  | {
      active: true;
      title: string;
      description: React.ReactNode;
      actionLabel: string;
      color: "danger" | "warning";
      showSaveToBrowser?: boolean;
      /** After vault backup, run the primary action (e.g. load shared link). */
      proceedOnSaveToBrowser?: boolean;

      onClose: () => void;
      onConfirm: () => void;
      onReject: () => void;
    }
  | { active: false };

export const overwriteConfirmStateAtom = atom<OverwriteConfirmState>({
  active: false,
});

export async function openConfirmModal({
  title,
  description,
  actionLabel,
  color,
  showSaveToBrowser,
  proceedOnSaveToBrowser,
}: {
  title: string;
  description: React.ReactNode;
  actionLabel: string;
  color: "danger" | "warning";
  showSaveToBrowser?: boolean;
  proceedOnSaveToBrowser?: boolean;
}) {
  return new Promise<boolean>((resolve) => {
    editorJotaiStore.set(overwriteConfirmStateAtom, {
      active: true,
      onConfirm: () => resolve(true),
      onClose: () => resolve(false),
      onReject: () => resolve(false),
      title,
      description,
      actionLabel,
      color,
      showSaveToBrowser,
      proceedOnSaveToBrowser,
    });
  });
}

export const confirmOverwriteConfirmModal = (): void => {
  const state = editorJotaiStore.get(overwriteConfirmStateAtom);
  if (!state.active) {
    return;
  }
  state.onConfirm();
  editorJotaiStore.set(overwriteConfirmStateAtom, { active: false });
};

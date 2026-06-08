import { OverwriteConfirmDialog } from "@excalidraw/excalidraw/components/OverwriteConfirm/OverwriteConfirm";
import {
  confirmOverwriteConfirmModal,
  overwriteConfirmStateAtom,
} from "@excalidraw/excalidraw/components/OverwriteConfirm/OverwriteConfirmState";
import { useAtomValue } from "@excalidraw/excalidraw/editor-jotai";
import { useExcalidrawAPI } from "@excalidraw/excalidraw/index";
import React from "react";

import { isSceneVaultEnabled } from "../scene-vault/constants";
import { sceneVaultService } from "../scene-vault/SceneVaultService";

export const SaveToBrowserOverwriteAction: React.FC<{
  onSaved?: () => void;
}> = React.memo(({ onSaved }) => {
  const overwriteConfirmState = useAtomValue(overwriteConfirmStateAtom);
  const excalidrawAPI = useExcalidrawAPI();

  if (
    !isSceneVaultEnabled() ||
    !overwriteConfirmState.active ||
    !excalidrawAPI
  ) {
    return null;
  }

  return (
    <OverwriteConfirmDialog.Action
      title="Save to Browser"
      actionLabel="Save to Browser"
      onClick={() => {
        const proceedOnSave = overwriteConfirmState.proceedOnSaveToBrowser;
        void sceneVaultService.archiveCurrentScene(excalidrawAPI).then(() => {
          onSaved?.();
          if (proceedOnSave) {
            confirmOverwriteConfirmModal();
          }
        });
      }}
    >
      Saves the current scene to browser storage (IndexedDB). You can open it
      later from My scenes. The data is lost if you clear site data or reinstall
      the browser.
    </OverwriteConfirmDialog.Action>
  );
});

SaveToBrowserOverwriteAction.displayName = "SaveToBrowserOverwriteAction";

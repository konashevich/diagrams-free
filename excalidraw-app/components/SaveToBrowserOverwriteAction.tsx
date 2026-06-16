import { OverwriteConfirmDialog } from "@excalidraw/excalidraw/components/OverwriteConfirm/OverwriteConfirm";
import {
  confirmOverwriteConfirmModal,
  dismissOverwriteConfirmModal,
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

  const saveAndReset = overwriteConfirmState.resetAfterSaveToBrowser;

  return (
    <OverwriteConfirmDialog.Action
      title={saveAndReset ? "Save and reset" : "Save to Browser"}
      actionLabel={saveAndReset ? "Save and reset" : "Save to Browser"}
      onClick={() => {
        const proceedOnSave = overwriteConfirmState.proceedOnSaveToBrowser;
        void sceneVaultService.archiveCurrentScene(excalidrawAPI).then(() => {
          if (saveAndReset) {
            return sceneVaultService
              .clearCanvasAfterArchive(excalidrawAPI)
              .then(() => {
                onSaved?.();
                dismissOverwriteConfirmModal();
              });
          }

          onSaved?.();
          if (proceedOnSave) {
            confirmOverwriteConfirmModal();
          }
        });
      }}
    >
      {saveAndReset
        ? "Saves the current scene to browser storage (IndexedDB), then clears the canvas. You can open it later from My scenes."
        : "Saves the current scene to browser storage (IndexedDB). You can open it later from My scenes. The data is lost if you clear site data or reinstall the browser."}
    </OverwriteConfirmDialog.Action>
  );
});

SaveToBrowserOverwriteAction.displayName = "SaveToBrowserOverwriteAction";

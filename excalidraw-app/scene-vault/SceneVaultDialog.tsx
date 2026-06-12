import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent, ReactNode } from "react";

import { Dialog } from "@excalidraw/excalidraw/components/Dialog";
import DialogActionButton from "@excalidraw/excalidraw/components/DialogActionButton";
import ConfirmDialog from "@excalidraw/excalidraw/components/ConfirmDialog";
import { TextField } from "@excalidraw/excalidraw/components/TextField";
import { ToolButton } from "@excalidraw/excalidraw/components/ToolButton";
import {
  DuplicateIcon,
  downloadIcon,
  pencilIcon,
  TrashIcon,
} from "@excalidraw/excalidraw/components/icons";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { useAtomValue } from "../app-jotai";

import { GoogleDrivePanel } from "../components/GoogleDrivePanel";

import { sceneVaultService } from "./SceneVaultService";
import { sceneVaultStore } from "./SceneVaultStore";
import type { VaultSceneMeta } from "./types";
import {
  SceneVaultQuotaError,
  SceneVaultUnavailableError,
} from "./vaultErrors";
import {
  sceneVaultListRevisionAtom,
  sceneVaultQuotaExceededAtom,
} from "./vaultState";
import { subscribeVaultChanges } from "./vaultTabSync";

import "./SceneVaultDialog.scss";

/** Default Dialog `small` (550px) + ~20% */
const SCENE_VAULT_DIALOG_WIDTH = 660;

type Props = {
  isOpen: boolean;
  onClose: () => void;
  excalidrawAPI: ExcalidrawImperativeAPI;
  activeSceneId: string | null;
  onScenesChange: () => void;
  confirmActiveSceneReload?: () => Promise<boolean>;
  onDriveMergeSuccess?: (message: string) => void;
};

const formatUpdatedAt = (timestamp: number): string => {
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return "";
  }
};

type SceneVaultIconButtonProps = {
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  variant?: "default" | "danger";
  onClick: (event: MouseEvent) => void;
};

const SceneVaultIconButton = ({
  label,
  icon,
  disabled,
  variant = "default",
  onClick,
}: SceneVaultIconButtonProps) => (
  <ToolButton
    type="button"
    size="small"
    className={`scene-vault-dialog__icon-btn${
      variant === "danger" ? " scene-vault-dialog__icon-btn--danger" : ""
    }`}
    aria-label={label}
    title={label}
    icon={icon}
    disabled={disabled}
    onClick={onClick}
  />
);

type SceneVaultListItemProps = {
  scene: VaultSceneMeta;
  isActive: boolean;
  busy: boolean;
  onOpen: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDownload: () => void;
  onDelete: () => void;
};

const SceneVaultListItem = ({
  scene,
  isActive,
  busy,
  onOpen,
  onRename,
  onDuplicate,
  onDownload,
  onDelete,
}: SceneVaultListItemProps) => {
  const stop = (event: MouseEvent) => {
    event.stopPropagation();
  };

  return (
    <li
      className={`scene-vault-dialog__item${
        isActive ? " scene-vault-dialog__item--active" : ""
      }`}
    >
      <button
        type="button"
        className="scene-vault-dialog__item-open"
        onClick={onOpen}
        disabled={busy}
        aria-label={`Open ${scene.title}`}
      >
        <span className="scene-vault-dialog__title">
          {scene.title}
          {isActive ? (
            <span className="scene-vault-dialog__editing-badge">editing</span>
          ) : null}
        </span>
        <span className="scene-vault-dialog__subtitle">
          {formatUpdatedAt(scene.updatedAt)} · {scene.elementCount} elements
        </span>
      </button>

      <div className="scene-vault-dialog__actions">
        <SceneVaultIconButton
          label="Rename"
          icon={pencilIcon}
          disabled={busy}
          onClick={(event) => {
            stop(event);
            onRename();
          }}
        />
        <SceneVaultIconButton
          label="Duplicate"
          icon={DuplicateIcon}
          disabled={busy}
          onClick={(event) => {
            stop(event);
            onDuplicate();
          }}
        />
        <SceneVaultIconButton
          label="Download"
          icon={downloadIcon}
          disabled={busy}
          onClick={(event) => {
            stop(event);
            onDownload();
          }}
        />
        <SceneVaultIconButton
          label="Delete"
          icon={TrashIcon}
          variant="danger"
          disabled={busy}
          onClick={(event) => {
            stop(event);
            onDelete();
          }}
        />
      </div>
    </li>
  );
};

export const SceneVaultDialog = ({
  isOpen,
  onClose,
  excalidrawAPI,
  activeSceneId,
  onScenesChange,
  confirmActiveSceneReload,
  onDriveMergeSuccess,
}: Props) => {
  const [scenes, setScenes] = useState<VaultSceneMeta[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<VaultSceneMeta | null>(null);
  const [renameTarget, setRenameTarget] = useState<VaultSceneMeta | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const vaultQuotaExceeded = useAtomValue(sceneVaultQuotaExceededAtom);
  const listRevision = useAtomValue(sceneVaultListRevisionAtom);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshList = useCallback(async () => {
    const list = await sceneVaultStore.listScenes();
    setScenes(list);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setActionError(null);
      void sceneVaultStore.repairVaultIndex().then(() => refreshList());
    }
  }, [isOpen, refreshList, activeSceneId, listRevision]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    return subscribeVaultChanges(() => {
      void refreshList();
      onScenesChange();
    });
  }, [isOpen, refreshList, onScenesChange]);

  useEffect(() => {
    if (renameTarget) {
      setRenameTitle(renameTarget.title);
    }
  }, [renameTarget]);

  const runAction = async (action: () => Promise<void>) => {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      await refreshList();
      onScenesChange();
    } catch (error) {
      console.error("[scene-vault]", error);
      if (error instanceof SceneVaultQuotaError) {
        setActionError(
          "Storage is full. Delete or download scenes to free space.",
        );
      } else if (error instanceof SceneVaultUnavailableError) {
        setActionError(error.message);
      } else if (error instanceof Error) {
        setActionError(error.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleOpenScene = (sceneId: string) => {
    if (activeSceneId === sceneId) {
      onClose();
      return;
    }

    void runAction(async () => {
      const ok = await sceneVaultService.openScene(excalidrawAPI, sceneId);
      if (ok) {
        onClose();
      } else {
        setActionError("Scene could not be loaded. Try again or delete it.");
      }
    });
  };

  const openImportPicker = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = (file: File) => {
    void runAction(async () => {
      await sceneVaultService.importSceneFromFile(file);
    });
  };

  if (!isOpen) {
    return null;
  }

  return (
    <>
      <Dialog
        className="scene-vault-dialog"
        onCloseRequest={onClose}
        title="My scenes"
        size={SCENE_VAULT_DIALOG_WIDTH}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="scene-vault-dialog__file-input"
          accept=".excalidraw,.json,application/json"
          tabIndex={-1}
          aria-hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) {
              handleImportFile(file);
            }
          }}
        />
        {(vaultQuotaExceeded || actionError) && (
          <p className="scene-vault-dialog__error" role="alert">
            {actionError ??
              "Storage is full. Delete or download scenes to free space."}
          </p>
        )}

        <div className="scene-vault-dialog__header-actions">
          <DialogActionButton
            label="New canvas"
            onClick={() =>
              runAction(async () => {
                await sceneVaultService.newCanvas(excalidrawAPI, "vault_dialog");
                onClose();
              })
            }
            disabled={busy}
          />
          <DialogActionButton
            label="Import file"
            onClick={openImportPicker}
            disabled={busy}
          />
        </div>

        <GoogleDrivePanel
          excalidrawAPI={excalidrawAPI}
          disabled={busy}
          confirmActiveSceneReload={confirmActiveSceneReload}
          onMergeSuccess={onDriveMergeSuccess}
          onSyncComplete={() => {
            void refreshList();
            onScenesChange();
          }}
        />

        {scenes.length === 0 ? (
          <p className="scene-vault-dialog__empty">
            No saved scenes yet. Use &quot;New canvas&quot; to archive your
            current drawing, or &quot;Import file&quot; to add a .excalidraw
            file to My scenes.
          </p>
        ) : (
          <ul
            className="scene-vault-dialog__list"
            aria-label="Saved scenes"
            aria-busy={busy}
          >
            {scenes.map((scene) => (
              <SceneVaultListItem
                key={scene.id}
                scene={scene}
                isActive={activeSceneId === scene.id}
                busy={busy}
                onOpen={() => handleOpenScene(scene.id)}
                onRename={() => setRenameTarget(scene)}
                onDuplicate={() =>
                  runAction(async () => {
                    await sceneVaultService.duplicateScene(scene.id);
                  })
                }
                onDownload={() =>
                  runAction(async () => {
                    await sceneVaultService.downloadScene(scene.id);
                  })
                }
                onDelete={() => setDeleteTarget(scene)}
              />
            ))}
          </ul>
        )}
      </Dialog>

      {deleteTarget && (
        <ConfirmDialog
          title="Delete scene?"
          onConfirm={() =>
            runAction(async () => {
              await sceneVaultService.deleteScene(deleteTarget.id, excalidrawAPI);
              setDeleteTarget(null);
            })
          }
          onCancel={() => setDeleteTarget(null)}
        >
          <p>
            Delete &quot;{deleteTarget.title}&quot;? This cannot be undone.
          </p>
        </ConfirmDialog>
      )}

      {renameTarget && (
        <ConfirmDialog
          title="Rename scene"
          onConfirm={() =>
            runAction(async () => {
              await sceneVaultService.renameScene(renameTarget.id, renameTitle);
              setRenameTarget(null);
            })
          }
          onCancel={() => setRenameTarget(null)}
        >
          <TextField
            label="Title"
            value={renameTitle}
            onChange={setRenameTitle}
            fullWidth
            selectOnRender
          />
        </ConfirmDialog>
      )}
    </>
  );
};

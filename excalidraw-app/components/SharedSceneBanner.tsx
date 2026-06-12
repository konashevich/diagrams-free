import { useState } from "react";

import { FilledButton } from "@excalidraw/excalidraw/components/FilledButton";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { sceneVaultService } from "../scene-vault";

import "./SharedSceneBanner.scss";

type Props = {
  excalidrawAPI: ExcalidrawImperativeAPI;
  onSavedToVault: () => void;
};

export const SharedSceneBanner = ({
  excalidrawAPI,
  onSavedToVault,
}: Props) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    setBusy(true);
    setError(null);
    void sceneVaultService
      .saveCanvasToVault(excalidrawAPI)
      .then(() => {
        onSavedToVault();
      })
      .catch((err) => {
        console.error("[scene-vault] save shared scene", err);
        setError(
          err instanceof Error ? err.message : "Could not save to My scenes.",
        );
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <div className="shared-scene-banner" role="status">
      <p className="shared-scene-banner__text">
        <strong>Snapshot from a link.</strong> You can edit here, but others
        will not see your changes. Save to My scenes to keep a copy in this
        browser and back it up to Google Drive.
      </p>
      {error ? (
        <p className="shared-scene-banner__error" role="alert">
          {error}
        </p>
      ) : null}
      <FilledButton
        size="medium"
        label="Save to My scenes"
        disabled={busy}
        onClick={handleSave}
      />
    </div>
  );
};

import clsx from "clsx";

import type { EditorInterface } from "@excalidraw/common";

import { t } from "../../i18n";
import { Button } from "../Button";
import { share } from "../icons";
import { useUIAppState } from "../../context/ui-appState";

import "./LiveCollaborationTrigger.scss";

const LiveCollaborationTrigger = ({
  isCollaborating,
  onSelect,
  editorInterface: _editorInterface,
  ...rest
}: {
  isCollaborating: boolean;
  onSelect: () => void;
  editorInterface?: EditorInterface;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) => {
  const appState = useUIAppState();

  return (
    <Button
      {...rest}
      className={clsx("collab-button", { active: isCollaborating })}
      type="button"
      onSelect={onSelect}
      style={{ position: "relative" }}
      title={t("labels.share")}
    >
      {share}
      {appState.collaborators.size > 0 && (
        <div className="CollabButton-collaborators">
          {appState.collaborators.size}
        </div>
      )}
    </Button>
  );
};

export default LiveCollaborationTrigger;
LiveCollaborationTrigger.displayName = "LiveCollaborationTrigger";

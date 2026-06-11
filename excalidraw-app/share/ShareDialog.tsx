import { trackEvent } from "@excalidraw/excalidraw/analytics";
import { copyTextToSystemClipboard } from "@excalidraw/excalidraw/clipboard";
import { Dialog } from "@excalidraw/excalidraw/components/Dialog";
import { FilledButton } from "@excalidraw/excalidraw/components/FilledButton";
import { TextField } from "@excalidraw/excalidraw/components/TextField";
import {
  copyIcon,
  LinkIcon,
  playerPlayIcon,
  playerStopFilledIcon,
  share,
  shareIOS,
  shareWindows,
} from "@excalidraw/excalidraw/components/icons";
import { useUIAppState } from "@excalidraw/excalidraw/context/ui-appState";
import { useCopyStatus } from "@excalidraw/excalidraw/hooks/useCopiedIndicator";
import { useI18n } from "@excalidraw/excalidraw/i18n";
import { KEYS, getFrame } from "@excalidraw/common";
import { useEffect, useRef, useState } from "react";

import { atom, useAtom, useAtomValue } from "../app-jotai";
import { activeRoomLinkAtom } from "../collab/Collab";
import {
  DriveApiError,
  initDriveAuth,
  isGoogleDriveLinked,
  signInWithGoogle,
  withDriveAccess,
} from "../google-drive";

import "./ShareDialog.scss";
import { QRCode } from "./QRCode";

import type { CollabAPI } from "../collab/Collab";

type OnExportToBackend = () => void | Promise<void>;
type OnCreateDriveShareLink = () => Promise<void>;
type ShareDialogType = "share" | "collaborationOnly";

export const shareDialogStateAtom = atom<
  { isOpen: false } | { isOpen: true; type: ShareDialogType }
>({ isOpen: false });

const getShareIcon = () => {
  const navigator = window.navigator as any;
  const isAppleBrowser = /Apple/.test(navigator.vendor);
  const isWindowsBrowser = navigator.appVersion.indexOf("Win") !== -1;

  if (isAppleBrowser) {
    return shareIOS;
  } else if (isWindowsBrowser) {
    return shareWindows;
  }

  return share;
};

export type ShareDialogProps = {
  collabAPI: CollabAPI | null;
  handleClose: () => void;
  onExportToBackend?: OnExportToBackend;
  onCreateDriveShareLink?: OnCreateDriveShareLink;
  isDriveShareEnabled?: boolean;
  type: ShareDialogType;
};

const ActiveRoomDialog = ({
  collabAPI,
  activeRoomLink,
  handleClose,
}: {
  collabAPI: CollabAPI;
  activeRoomLink: string;
  handleClose: () => void;
}) => {
  const { t } = useI18n();
  const [, setJustCopied] = useState(false);
  const timerRef = useRef<number>(0);
  const ref = useRef<HTMLInputElement>(null);
  const isShareSupported = "share" in navigator;
  const { onCopy, copyStatus } = useCopyStatus();

  const copyRoomLink = async () => {
    try {
      await copyTextToSystemClipboard(activeRoomLink);
    } catch (e) {
      collabAPI.setCollabError(t("errors.copyToSystemClipboardFailed"));
    }

    setJustCopied(true);

    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }

    timerRef.current = window.setTimeout(() => {
      setJustCopied(false);
    }, 3000);

    ref.current?.select();
  };

  const shareRoomLink = async () => {
    try {
      await navigator.share({
        title: t("roomDialog.shareTitle"),
        text: t("roomDialog.shareTitle"),
        url: activeRoomLink,
      });
    } catch (error: any) {
      // Just ignore.
    }
  };

  return (
    <>
      <h3 className="ShareDialog__active__header">
        {t("labels.liveCollaboration").replace(/\./g, "")}
      </h3>
      <TextField
        defaultValue={collabAPI.getUsername()}
        placeholder="Your name"
        label="Your name"
        onChange={collabAPI.setUsername}
        onKeyDown={(event) => event.key === KEYS.ENTER && handleClose()}
      />
      <div className="ShareDialog__active__linkRow">
        <TextField
          ref={ref}
          label="Link"
          readonly
          fullWidth
          value={activeRoomLink}
        />
        {isShareSupported && (
          <FilledButton
            size="large"
            variant="icon"
            label="Share"
            icon={getShareIcon()}
            className="ShareDialog__active__share"
            onClick={shareRoomLink}
          />
        )}
        <FilledButton
          size="large"
          label={t("buttons.copyLink")}
          icon={copyIcon}
          status={copyStatus}
          onClick={() => {
            copyRoomLink();
            onCopy();
          }}
        />
      </div>
      <QRCode value={activeRoomLink} />
      <div className="ShareDialog__active__description">
        <p>
          <span
            role="img"
            aria-hidden="true"
            className="ShareDialog__active__description__emoji"
          >
            🔒{" "}
          </span>
          {t("roomDialog.desc_privacy")}
        </p>
        <p>{t("roomDialog.desc_exitSession")}</p>
      </div>

      <div className="ShareDialog__active__actions">
        <FilledButton
          size="large"
          variant="outlined"
          color="danger"
          label={t("roomDialog.button_stopSession")}
          icon={playerStopFilledIcon}
          onClick={() => {
            trackEvent("share", "room closed");
            collabAPI.stopCollaboration();
            if (!collabAPI.isCollaborating()) {
              handleClose();
            }
          }}
        />
      </div>
    </>
  );
};

const DriveShareSection = ({
  onCreateDriveShareLink,
  handleClose,
  setError,
}: {
  onCreateDriveShareLink: OnCreateDriveShareLink;
  handleClose: () => void;
  setError: (message: string) => void;
}) => {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void initDriveAuth();
  }, []);

  const runShare = async () => {
    setBusy(true);
    setError("");
    try {
      if (!isGoogleDriveLinked()) {
        await signInWithGoogle();
      }
      await withDriveAccess(async () => {
        await onCreateDriveShareLink();
      });
      handleClose();
    } catch (err) {
      console.error("[google-drive] share", err);
      if (err instanceof DriveApiError && err.status === 401) {
        setError(
          "Could not refresh Google access. Try again or reconnect Google in My scenes.",
        );
      } else {
        setError(err instanceof Error ? err.message : "Could not create link.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="ShareDialog__picker__header">
        {t("exportDialog.link_title")}
      </div>
      <div className="ShareDialog__picker__description">
        Creates an <strong>anyone with the link</strong> URL on{" "}
        <strong>diagrams.free</strong>. The file is stored in your Google Drive
        under <code>diagrams.free/</code>. To restrict access to specific
        people, change sharing on that file in{" "}
        <a
          href="https://drive.google.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          Google Drive
        </a>{" "}
        after creating the link (in-app email sharing is not supported with our
        current Google permissions).
      </div>

      <div className="ShareDialog__picker__button">
        <FilledButton
          size="large"
          label={t("exportDialog.link_button")}
          icon={LinkIcon}
          disabled={busy}
          onClick={() => void runShare()}
        />
      </div>
    </>
  );
};

const ShareDialogPicker = (props: ShareDialogProps) => {
  const { t } = useI18n();
  const [localError, setLocalError] = useState("");

  const { collabAPI } = props;

  const startCollabJSX =
    collabAPI && props.type === "share" ? (
      <>
        <div className="ShareDialog__picker__header">
          {t("labels.liveCollaboration").replace(/\./g, "")}
        </div>

        <div className="ShareDialog__picker__description">
          <div style={{ marginBottom: "1em" }}>{t("roomDialog.desc_intro")}</div>
          {t("roomDialog.desc_privacy")}
        </div>

        <div className="ShareDialog__picker__button">
          <FilledButton
            size="large"
            label={t("roomDialog.button_startSession")}
            icon={playerPlayIcon}
            onClick={() => {
              trackEvent("share", "room creation", `ui (${getFrame()})`);
              collabAPI.startCollaboration(null);
            }}
          />
        </div>

        <div className="ShareDialog__separator">
          <span>{t("shareDialog.or")}</span>
        </div>
      </>
    ) : collabAPI ? (
      <>
        <div className="ShareDialog__picker__header">
          {t("labels.liveCollaboration").replace(/\./g, "")}
        </div>
        <div className="ShareDialog__picker__description">
          <div style={{ marginBottom: "1em" }}>{t("roomDialog.desc_intro")}</div>
          {t("roomDialog.desc_privacy")}
        </div>
        <div className="ShareDialog__picker__button">
          <FilledButton
            size="large"
            label={t("roomDialog.button_startSession")}
            icon={playerPlayIcon}
            onClick={() => {
              trackEvent("share", "room creation", `ui (${getFrame()})`);
              collabAPI.startCollaboration(null);
            }}
          />
        </div>
      </>
    ) : null;

  const legacyShareJSX =
    props.onExportToBackend && !props.isDriveShareEnabled ? (
      <>
        <div className="ShareDialog__picker__header">
          {t("exportDialog.link_title")}
        </div>
        <div className="ShareDialog__picker__description">
          {t("exportDialog.link_details")}
        </div>
        <div className="ShareDialog__picker__button">
          <FilledButton
            size="large"
            label={t("exportDialog.link_button")}
            icon={LinkIcon}
            onClick={async () => {
              await props.onExportToBackend?.();
              props.handleClose();
            }}
          />
        </div>
      </>
    ) : null;

  const driveShareJSX =
    props.isDriveShareEnabled && props.onCreateDriveShareLink ? (
      <DriveShareSection
        onCreateDriveShareLink={props.onCreateDriveShareLink}
        handleClose={props.handleClose}
        setError={setLocalError}
      />
    ) : null;

  return (
    <>
      {startCollabJSX}
      {localError ? (
        <p className="ShareDialog__error" role="alert">
          {localError}
        </p>
      ) : null}
      {props.type === "share" && (driveShareJSX || legacyShareJSX)}
    </>
  );
};

const ShareDialogInner = (props: ShareDialogProps) => {
  const activeRoomLink = useAtomValue(activeRoomLinkAtom);

  return (
    <Dialog size="small" onCloseRequest={props.handleClose} title={false}>
      <div className="ShareDialog">
        {props.collabAPI && activeRoomLink ? (
          <ActiveRoomDialog
            collabAPI={props.collabAPI}
            activeRoomLink={activeRoomLink}
            handleClose={props.handleClose}
          />
        ) : (
          <ShareDialogPicker {...props} />
        )}
      </div>
    </Dialog>
  );
};

export const ShareDialog = (props: {
  collabAPI: CollabAPI | null;
  onExportToBackend?: OnExportToBackend;
  onCreateDriveShareLink?: OnCreateDriveShareLink;
  isDriveShareEnabled?: boolean;
}) => {
  const [shareDialogState, setShareDialogState] = useAtom(shareDialogStateAtom);

  const { openDialog } = useUIAppState();

  useEffect(() => {
    if (openDialog) {
      setShareDialogState({ isOpen: false });
    }
  }, [openDialog, setShareDialogState]);

  if (!shareDialogState.isOpen) {
    return null;
  }

  return (
    <ShareDialogInner
      handleClose={() => setShareDialogState({ isOpen: false })}
      collabAPI={props.collabAPI}
      onExportToBackend={props.onExportToBackend}
      onCreateDriveShareLink={props.onCreateDriveShareLink}
      isDriveShareEnabled={props.isDriveShareEnabled}
      type={shareDialogState.type}
    />
  );
};

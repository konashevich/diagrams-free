import { eyeIcon } from "@excalidraw/excalidraw/components/icons";
import { MainMenu } from "@excalidraw/excalidraw/index";
import { t } from "@excalidraw/excalidraw/i18n";
import React from "react";

import { isDevEnv } from "@excalidraw/common";

import type { Theme } from "@excalidraw/element/types";

import { LanguageList } from "../app-language/LanguageList";
import {
  isContactFormEnabled,
  isDonateEnabled,
  SITE_URL,
} from "../branding/constants";
import { trackDonateModalOpen } from "../analytics/engagement";
import { openContactUsDialog } from "../contact/openContactUs";

import { saveDebugState } from "./DebugCanvas";

export const AppMainMenu: React.FC<{
  onCollabDialogOpen: () => any;
  isCollaborating: boolean;
  isCollabEnabled: boolean;
  theme: Theme | "system";
  setTheme: (theme: Theme | "system") => void;
  refresh: () => void;
  sceneVaultEnabled?: boolean;
  onOpenSceneVault?: () => void;
  onSaveToBrowser?: () => void;
  onNewCanvas?: () => void;
  onResetCanvas?: () => void;
  onOpenDonate?: () => void;
}> = React.memo((props) => {
  return (
    <MainMenu>
      <MainMenu.DefaultItems.LoadScene />
      <MainMenu.DefaultItems.SaveToActiveFile />
      <MainMenu.DefaultItems.Export />
      <MainMenu.DefaultItems.SaveAsImage />
      {props.sceneVaultEnabled && (
        <>
          <MainMenu.Item
            onSelect={props.onOpenSceneVault}
            title="Browse and open saved scenes"
          >
            My scenes
          </MainMenu.Item>
          <MainMenu.Item
            onSelect={props.onSaveToBrowser}
            title="Save the current scene to browser storage and keep it open."
          >
            Save to browser
          </MainMenu.Item>
          <MainMenu.Item
            onSelect={props.onNewCanvas}
            title="Save and reset current scene"
          >
            New canvas (save and reset)
          </MainMenu.Item>
          <MainMenu.Item
            onSelect={props.onResetCanvas}
            title="Delete current scene"
          >
            Reset canvas
          </MainMenu.Item>
        </>
      )}
      {props.isCollabEnabled && (
        <MainMenu.DefaultItems.LiveCollaborationTrigger
          isCollaborating={props.isCollaborating}
          onSelect={() => props.onCollabDialogOpen()}
        />
      )}
      <MainMenu.DefaultItems.CommandPalette className="highlighted" />
      <MainMenu.DefaultItems.SearchMenu />
      <MainMenu.DefaultItems.Help />
      {!props.sceneVaultEnabled && <MainMenu.DefaultItems.ClearCanvas />}
      <MainMenu.Separator />
      {isDonateEnabled() && props.onOpenDonate && (
        <MainMenu.Item
          onSelect={() => {
            trackDonateModalOpen("menu");
            props.onOpenDonate?.();
          }}
        >
          Support diagrams.free
        </MainMenu.Item>
      )}
      {isContactFormEnabled() && (
        <MainMenu.Item onSelect={openContactUsDialog}>
          {t("contactUs.menuItem")}
        </MainMenu.Item>
      )}
      <MainMenu.ItemLink href={`${SITE_URL}/about/`}>About</MainMenu.ItemLink>
      <MainMenu.ItemLink href={`${SITE_URL}/privacy/`}>
        Privacy
      </MainMenu.ItemLink>
      <MainMenu.ItemLink href={`${SITE_URL}/terms/`}>Terms</MainMenu.ItemLink>
      {isDevEnv() && (
        <MainMenu.Item
          icon={eyeIcon}
          onSelect={() => {
            if (window.visualDebug) {
              delete window.visualDebug;
              saveDebugState({ enabled: false });
            } else {
              window.visualDebug = { data: [] };
              saveDebugState({ enabled: true });
            }
            props?.refresh();
          }}
        >
          Visual Debug
        </MainMenu.Item>
      )}
      <MainMenu.Separator />
      <MainMenu.DefaultItems.Preferences />
      <MainMenu.DefaultItems.ToggleTheme
        allowSystemTheme
        theme={props.theme}
        onSelect={props.setTheme}
      />
      <MainMenu.ItemCustom>
        <LanguageList style={{ width: "100%" }} />
      </MainMenu.ItemCustom>
      <MainMenu.DefaultItems.ChangeCanvasBackground />
    </MainMenu>
  );
});

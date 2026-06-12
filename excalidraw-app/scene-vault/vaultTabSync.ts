import { incrementVaultContentRevision } from "../google-drive/constants";

import { appJotaiStore } from "../app-jotai";

import { VAULT_BROADCAST_CHANNEL } from "./constants";
import { sceneVaultListRevisionAtom } from "./vaultState";

export type VaultBroadcastMessage = {
  type: "vault-updated";
  timestamp: number;
};

const postVaultUpdated = (): void => {
  if (typeof BroadcastChannel === "undefined") {
    return;
  }
  try {
    const channel = new BroadcastChannel(VAULT_BROADCAST_CHANNEL);
    const message: VaultBroadcastMessage = {
      type: "vault-updated",
      timestamp: Date.now(),
    };
    channel.postMessage(message);
    channel.close();
  } catch (error) {
    console.warn("[scene-vault] BroadcastChannel notify failed:", error);
  }
};

export const notifyVaultChanged = (): void => {
  incrementVaultContentRevision();
  appJotaiStore.set(sceneVaultListRevisionAtom, (revision) => revision + 1);
  postVaultUpdated();
};

export const subscribeVaultChanges = (listener: () => void): (() => void) => {
  if (typeof BroadcastChannel === "undefined") {
    return () => {};
  }

  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(VAULT_BROADCAST_CHANNEL);
    channel.onmessage = (event: MessageEvent<VaultBroadcastMessage>) => {
      if (event.data?.type === "vault-updated") {
        listener();
      }
    };
  } catch (error) {
    console.warn("[scene-vault] BroadcastChannel subscribe failed:", error);
    return () => {};
  }

  return () => {
    channel?.close();
  };
};

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

vi.mock("../google-drive", () => ({
  driveSyncService: { backupVaultToDrive: vi.fn() },
  driveAccessRefreshFailedMessage: "Session expired",
  formatDriveMergeSuccessMessage: vi.fn(() => "Merged"),
  getDriveLastPullAt: vi.fn(() => null),
  getDriveLastPushAt: vi.fn(() => null),
  getDriveLastSyncAt: vi.fn(() => null),
  getGoogleAccountEmail: vi.fn(),
  hasValidAccessToken: vi.fn(() => true),
  warmDriveAccessToken: vi.fn(),
  isDriveAccessRefreshError: vi.fn(() => false),
  isDriveAutoSyncEnabled: vi.fn(() => false),
  isGoogleDriveEnabled: vi.fn(() => true),
  isSignedInToGoogle: vi.fn(() => false),
  setDriveAutoSyncEnabled: vi.fn(),
  setDriveLastSyncAt: vi.fn(),
  signInWithGoogle: vi.fn(),
  signOutFromGoogle: vi.fn(() => Promise.resolve()),
  withDriveAccess: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("./useDriveSessionMonitor", () => ({
  useDriveSessionMonitor: vi.fn(),
}));

vi.mock("./useDriveAutoMerge", () => ({
  runDriveMergeNow: vi.fn(),
  signInAndMergeDrive: vi.fn(),
}));

import {
  getGoogleAccountEmail,
  isGoogleDriveEnabled,
  isSignedInToGoogle,
  warmDriveAccessToken,
} from "../google-drive";

import { GoogleDrivePanel } from "./GoogleDrivePanel";

const mockApi = {} as ExcalidrawImperativeAPI;

const renderPanel = () =>
  render(
    <GoogleDrivePanel excalidrawAPI={mockApi} onSyncComplete={() => {}} />,
  );

describe("GoogleDrivePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isGoogleDriveEnabled).mockReturnValue(true);
    vi.mocked(isSignedInToGoogle).mockReturnValue(false);
    vi.mocked(warmDriveAccessToken).mockResolvedValue(true);
    vi.mocked(getGoogleAccountEmail).mockResolvedValue(undefined);
  });

  it("renders nothing when Google Drive is disabled", () => {
    vi.mocked(isGoogleDriveEnabled).mockReturnValue(false);
    const { container } = renderPanel();
    expect(container.firstChild).toBeNull();
  });

  it("shows Not signed in and hides sync report when signed out", async () => {
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("Not signed in")).toBeInTheDocument();
    });
    expect(screen.queryByText("Sync report")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in with google/i })).toBeInTheDocument();
  });

  it("shows Connecting… while the account email is loading", async () => {
    vi.mocked(isSignedInToGoogle).mockReturnValue(true);
    vi.mocked(getGoogleAccountEmail).mockImplementation(
      () => new Promise(() => {}),
    );

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("Connecting…")).toBeInTheDocument();
    });
  });

  it("shows sync report collapsed when signed in", async () => {
    vi.mocked(isSignedInToGoogle).mockReturnValue(true);
    vi.mocked(getGoogleAccountEmail).mockResolvedValue("user@example.com");

    renderPanel();

    await waitFor(() => {
      expect(
        screen.getByText("Connected as user@example.com"),
      ).toBeInTheDocument();
    });

    const syncReport = screen.getByText("Sync report").closest("details");
    expect(syncReport).toBeInTheDocument();
    expect(syncReport).not.toHaveAttribute("open");
    expect(screen.getByText(/Last backed up to Drive/)).toBeInTheDocument();
    expect(screen.getByText(/Last merged from Drive/)).toBeInTheDocument();
  });

  it("exposes full help text for assistive tech and native title fallback", async () => {
    renderPanel();

    const infoButton = screen.getByRole("button", {
      name: /about google drive backup/i,
    });
    expect(infoButton).toHaveAttribute("title", expect.stringContaining("diagrams.free/vault/"));

    const describedBy = infoButton.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toContain(
      "Auto-backup only controls pushing edits to Drive.",
    );
  });
});

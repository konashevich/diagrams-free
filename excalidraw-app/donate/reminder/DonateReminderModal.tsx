import { Dialog } from "@excalidraw/excalidraw/components/Dialog";
import DialogActionButton from "@excalidraw/excalidraw/components/DialogActionButton";

import "./DonateReminderModal.scss";

type Props = {
  isOpen: boolean;
  onSupport: () => void;
  onSnoozeMonth: () => void;
  onClose: () => void;
};

export const DonateReminderModal = ({
  isOpen,
  onSupport,
  onSnoozeMonth,
  onClose,
}: Props) => {
  if (!isOpen) {
    return null;
  }

  return (
    <Dialog
      className="donate-reminder-modal"
      onCloseRequest={onClose}
      title="Enjoying diagrams.free?"
      size={440}
    >
      <p className="donate-reminder-modal__body">
        diagrams.free stays free. Voluntary tips help cover hosting and
        development.
      </p>
      <div className="donate-reminder-modal__actions">
        <DialogActionButton
          label="Support diagrams.free"
          actionType="primary"
          onClick={onSupport}
        />
        <DialogActionButton
          label="Not now — ask again in a month"
          onClick={onSnoozeMonth}
        />
      </div>
    </Dialog>
  );
};

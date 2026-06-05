import { useMemo } from "react";

import { Dialog } from "@excalidraw/excalidraw/components/Dialog";
import DialogActionButton from "@excalidraw/excalidraw/components/DialogActionButton";

import { trackDonateCheckout } from "../analytics/engagement";

import {
  buildDonateLinks,
  DONATE_PRESETS,
  getDonateCheckoutUrl,
  type DonateKind,
  type DonateTier,
} from "./donateConfig";

import "./DonateModal.scss";

const DONATE_DIALOG_WIDTH = 720;

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

const DonatePanel = ({
  title,
  kind,
  links,
  showCustomAmount,
}: {
  title: string;
  kind: DonateKind;
  links: NonNullable<ReturnType<typeof buildDonateLinks>>;
  showCustomAmount: boolean;
}) => {
  const openCheckout = (tier: DonateTier, label: string) => {
    const url = getDonateCheckoutUrl(links, kind, tier);
    trackDonateCheckout(kind, tier);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <section aria-labelledby={`donate-${kind}-title`}>
      <h3 className="donate-modal__panel-title" id={`donate-${kind}-title`}>
        {title}
      </h3>
      <div className="donate-modal__buttons">
        {DONATE_PRESETS.map(({ tier, label }) => (
          <DialogActionButton
            key={`${kind}-${tier}`}
            label={label}
            onClick={() => openCheckout(tier, label)}
          />
        ))}
        {showCustomAmount && (
          <div className="donate-modal__custom">
            <DialogActionButton
              label="Your amount"
              onClick={() => openCheckout("custom", "custom")}
            />
          </div>
        )}
      </div>
    </section>
  );
};

export const DonateModal = ({ isOpen, onClose }: Props) => {
  const links = useMemo(() => buildDonateLinks(), []);

  if (!isOpen || !links) {
    return null;
  }

  return (
    <Dialog
      className="donate-modal"
      onCloseRequest={onClose}
      title="Support diagrams.free"
      size={DONATE_DIALOG_WIDTH}
    >
      <p className="donate-modal__intro">
        diagrams.free stays free. Voluntary tips help cover hosting and
        development. Payments are processed securely by Stripe — we never see
        your card number.
      </p>
      <div className="donate-modal__columns">
        <DonatePanel
          title="One-time donation"
          kind="once"
          links={links}
          showCustomAmount
        />
        <DonatePanel
          title="Monthly recurring donation"
          kind="monthly"
          links={links}
          showCustomAmount={false}
        />
      </div>
    </Dialog>
  );
};

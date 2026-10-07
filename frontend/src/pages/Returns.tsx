import PolicyPage, { EmailLink, PolicySection, WhatsAppLink } from "../components/PolicyPage";

export default function Returns() {
  return (
    <PolicyPage title="Returns Policy">
      <PolicySection heading="Changed your mind?">
        <p>
          You may cancel your order and return it for any reason within 7 days of delivery. This is
          your cooling-off right under the Electronic Communications and Transactions Act (ECTA).
        </p>
        <p>
          Please return the item in the condition you received it, in its original packaging if
          possible. The only cost to you is the cost of sending it back. We will refund everything
          you paid within 30 days of your cancellation.
        </p>
        <p>
          This does not apply to items made or personalised to your order, or to goods that spoil
          quickly.
        </p>
      </PolicySection>

      <PolicySection heading="Damaged, defective or wrong items">
        <p>
          If an item arrives damaged, is defective, or is not what you ordered, you may return it
          within 6 months of delivery, as the Consumer Protection Act (CPA) provides. We pay the
          return costs, and you choose whether we repair it, replace it or refund you.
        </p>
        <p>
          If we repair an item and the same problem comes back within 3 months, we will replace it
          or refund you. This does not cover damage caused by misuse after delivery.
        </p>
      </PolicySection>

      <PolicySection heading="How to start a return">
        <p>
          Contact us at <EmailLink /> or WhatsApp <WhatsAppLink /> with your order reference, and we
          will arrange it with you.
        </p>
      </PolicySection>

      <p className="text-base text-maroon-900/60">
        Nothing in this policy limits your rights under the Consumer Protection Act or ECTA.
      </p>
    </PolicyPage>
  );
}

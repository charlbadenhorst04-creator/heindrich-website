import PolicyPage, {
  EmailLink,
  ExternalLink,
  PolicySection,
  WhatsAppLink,
  policyLinkClass,
} from "../components/PolicyPage";

export default function Privacy() {
  return (
    <PolicyPage title="Privacy Policy">
      <p>
        This policy explains what personal information MERAVO collects, why we collect it, and your
        rights under South Africa's Protection of Personal Information Act (POPIA).
      </p>

      <PolicySection heading="What we collect">
        <p>
          When you place an order, we collect your name, email address, phone number, delivery
          address and the details of your order.
        </p>
        <p>
          Card and bank details are entered on the secure page of our payment provider, Stitch. We
          never see or store them. We only receive confirmation of whether your payment went
          through.
        </p>
      </PolicySection>

      <PolicySection heading="Why we use it">
        <p>
          Only to process your order, deliver your purchase and contact you about it, for example to
          send your order confirmation. We do not use it for marketing.
        </p>
      </PolicySection>

      <PolicySection heading="Who we share it with">
        <p>
          We do not sell or share your information with third parties, except service providers
          needed to fulfil your order: our courier (Aramex), our payment provider (Stitch), and the
          companies that host our website and email. They may only use it for that purpose and must
          keep it secure.
        </p>
        <p>
          Some of these providers store information on servers outside South Africa. We only send
          it there where POPIA allows, such as where it is needed to fulfil your order, and only to
          providers bound to keep it secure.
        </p>
      </PolicySection>

      <PolicySection heading="How long we keep it">
        <p>
          We keep your order details for as long as we need them for your order, and for as long as
          tax and accounting laws require us to keep records. After that, we delete them.
        </p>
      </PolicySection>

      <PolicySection heading="How we protect it">
        <p>
          We take reasonable steps to keep your information safe, including encrypted (https)
          connections. If we believe your information has been accessed by someone without
          permission, we will tell you and the Information Regulator as soon as we reasonably can.
        </p>
      </PolicySection>

      <PolicySection heading="Your browser">
        <p>
          The site stores a small reference in your browser so it can remember your cart and a
          display preference. We do not use advertising or tracking cookies.
        </p>
      </PolicySection>

      <PolicySection heading="Your rights">
        <p>
          You may ask us what personal information we hold about you, and ask us to correct or
          delete it, or object to how we use it, at any time by contacting us at <EmailLink />.
        </p>
        <p>
          If you are not happy with how we handle your request, you can complain to the Information
          Regulator at{" "}
          <ExternalLink href="https://inforegulator.org.za">inforegulator.org.za</ExternalLink> or{" "}
          <a href="mailto:POPIAComplaints@inforegulator.org.za" className={policyLinkClass}>
            POPIAComplaints@inforegulator.org.za
          </a>
          .
        </p>
      </PolicySection>

      <PolicySection heading="Contact us">
        <p>
          MERAVO is responsible for your personal information. Contact us at <EmailLink /> or on
          WhatsApp at <WhatsAppLink />.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}

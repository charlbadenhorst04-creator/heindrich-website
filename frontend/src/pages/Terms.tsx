import { Link } from "react-router-dom";

import PolicyPage, {
  EmailLink,
  ExternalLink,
  PolicySection,
  WhatsAppLink,
  policyLinkClass,
} from "../components/PolicyPage";

function ReturnsLink() {
  return (
    <Link to="/returns" className={policyLinkClass}>
      Returns Policy
    </Link>
  );
}

export default function Terms() {
  return (
    <PolicyPage title="Terms of Service">
      <PolicySection heading="Ordering and payment">
        <p>
          By ordering from this site you agree to these terms. Prices are in South African rand
          (ZAR), and the delivery fee is shown before you pay. You pay the listed price in full,
          through our payment provider Stitch, before your order is dispatched.
        </p>
      </PolicySection>

      <PolicySection heading="Products">
        <p>
          We aim to describe all products accurately, but slight variations may occur, for example
          in colour between screens. If an item is clearly different from its description, it is
          covered by our <ReturnsLink />.
        </p>
      </PolicySection>

      <PolicySection heading="Delivery">
        <p>
          We deliver nationwide with Aramex, usually within 2-4 business days of dispatch. Courier
          delays can happen and are outside our control, but your order stays our responsibility
          until it is delivered to you. If it is lost or damaged on the way, we will replace it or
          refund you.
        </p>
        <p>
          If we have not delivered within 30 days of your order, you may cancel it and we will
          refund you in full. If an item turns out to be unavailable after you have paid, we will
          tell you straight away and refund you within 30 days.
        </p>
      </PolicySection>

      <PolicySection heading="Faulty or damaged items">
        <p>
          Defective or damaged items are covered under our <ReturnsLink />, in line with the
          Consumer Protection Act.
        </p>
      </PolicySection>

      <PolicySection heading="Disputes">
        <p>
          For any disputes, contact us directly first at <EmailLink /> or on WhatsApp at{" "}
          <WhatsAppLink />, and we are committed to resolving issues fairly. If we cannot resolve
          it, you can approach the Consumer Goods and Services Ombud at{" "}
          <ExternalLink href="https://www.cgso.org.za">cgso.org.za</ExternalLink> or the National
          Consumer Commission.
        </p>
        <p>
          These terms are governed by South African law and do not limit your rights under the
          Consumer Protection Act or the Electronic Communications and Transactions Act.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}

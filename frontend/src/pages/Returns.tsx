import PolicyPage, { policyLinkClass } from "../components/PolicyPage";

export default function Returns() {
  return (
    <PolicyPage title="Returns Policy">
      <p>
        You may return an item within 7 days of delivery if it is unused, unworn and in its
        original packaging. In line with South African consumer law, you also have a
        5-business-day cooling-off right on online purchases. If an item arrives damaged or
        defective, contact us within 7 days for a replacement or refund. To start a return, contact
        us at{" "}
        <a href="mailto:heinrichcdoman@gmail.com" className={policyLinkClass}>
          heinrichcdoman@gmail.com
        </a>{" "}
        or WhatsApp{" "}
        <a
          href="https://wa.me/27671572670"
          target="_blank"
          rel="noreferrer"
          className={policyLinkClass}
        >
          067 157 2670
        </a>
        .
      </p>
    </PolicyPage>
  );
}

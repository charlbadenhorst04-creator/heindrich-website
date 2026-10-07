import PolicyPage, { policyLinkClass } from "../components/PolicyPage";

export default function Privacy() {
  return (
    <PolicyPage title="Privacy Policy">
      <p>
        We collect your name, email, delivery address and payment details only to process your
        order and deliver your purchase. We do not sell or share your information with third
        parties, except service providers needed to fulfil your order (such as couriers and payment
        processors). You may request access to, correction of, or deletion of your personal
        information at any time by contacting us at{" "}
        <a href="mailto:heinrichcdoman@gmail.com" className={policyLinkClass}>
          heinrichcdoman@gmail.com
        </a>
        . This policy is in line with South Africa's Protection of Personal Information Act
        (POPIA).
      </p>
    </PolicyPage>
  );
}

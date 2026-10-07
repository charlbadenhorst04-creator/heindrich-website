import { Link } from "react-router-dom";

import PolicyPage, { policyLinkClass } from "../components/PolicyPage";

export default function Terms() {
  return (
    <PolicyPage title="Terms of Service">
      <p>
        By ordering from this site you agree to pay the listed price in full before dispatch. We
        aim to describe all products accurately, but slight variations may occur. We are not liable
        for courier delays once an order has been dispatched. Defective or damaged items are
        covered under our{" "}
        <Link to="/returns" className={policyLinkClass}>
          Returns Policy
        </Link>
        . For any disputes, contact us directly first, and we are committed to resolving issues
        fairly.
      </p>
    </PolicyPage>
  );
}

import { Link } from "react-router-dom";

const POLICIES = [
  { to: "/privacy", label: "Privacy Policy" },
  { to: "/returns", label: "Returns Policy" },
  { to: "/terms", label: "Terms of Service" },
];

export default function Footer() {
  return (
    <footer className="mt-24 border-t border-maroon-100 bg-white/60">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="font-display text-xl text-maroon-700">MERAVO</p>
            <p className="mt-2 text-sm text-maroon-900/60">Your style. Your story.</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-maroon-800">Contact</p>
            <p className="mt-2 text-sm text-maroon-900/60">067 157 2670</p>
            <p className="text-sm text-maroon-900/60">Heinrichcdoman@gmail.com</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-maroon-800">Shipping</p>
            <p className="mt-2 text-sm text-maroon-900/60">
              Proudly South African. Delivered nationwide via Aramex, 2-4 business days.
            </p>
          </div>
          <nav aria-label="Policies">
            <p className="text-sm font-semibold text-maroon-800">Policies</p>
            <ul className="mt-2 space-y-1">
              {POLICIES.map((policy) => (
                <li key={policy.to}>
                  <Link
                    to={policy.to}
                    className="text-sm text-maroon-900/60 transition-colors hover:text-maroon-700"
                  >
                    {policy.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <p className="mt-8 text-xs text-maroon-900/40">
          &copy; {new Date().getFullYear()} MERAVO. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

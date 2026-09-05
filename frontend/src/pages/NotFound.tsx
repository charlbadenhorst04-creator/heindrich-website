import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center">
      <p className="font-display text-6xl text-maroon-700">404</p>
      <p className="mt-4 text-maroon-900/60">This page doesn't exist.</p>
      <Link to="/" className="mt-8 inline-block rounded-full bg-maroon-700 px-8 py-3 text-sm font-semibold text-white hover:bg-maroon-800">
        Back to Home
      </Link>
    </div>
  );
}

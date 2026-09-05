export default function Footer() {
  return (
    <footer className="mt-24 border-t border-maroon-100 bg-white/60">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
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
            <p className="mt-2 text-sm text-maroon-900/60">Proudly South African. We ship nationwide.</p>
          </div>
        </div>
        <p className="mt-8 text-xs text-maroon-900/40">
          &copy; {new Date().getFullYear()} MERAVO. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

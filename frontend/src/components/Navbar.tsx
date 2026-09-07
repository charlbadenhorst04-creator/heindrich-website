import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";

import { useCartStore } from "../store/cartStore";
import Logo from "./Logo";

const links = [
  { to: "/", label: "Home" },
  { to: "/shop", label: "Shop" },
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
];

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { fetchCart, itemCount } = useCartStore();
  const location = useLocation();

  useEffect(() => {
    fetchCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <header className="sticky top-0 z-40 bg-blush-50/90 backdrop-blur border-b border-maroon-100">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link
          to="/"
          className="flex items-center gap-2 font-display text-2xl font-semibold tracking-wide text-maroon-700"
        >
          <Logo className="h-7 w-7 text-maroon-700" />
          MERAVO
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {links.map((link) => {
            const isActive = location.pathname === link.to;
            return (
              <NavLink
                key={link.to}
                to={link.to}
                className="relative py-1 text-sm font-medium tracking-wide text-maroon-900/70 transition-colors hover:text-maroon-600 aria-[current=page]:text-maroon-700"
              >
                {link.label}
                {isActive && (
                  <motion.span
                    layoutId="nav-underline"
                    className="absolute -bottom-0.5 left-0 right-0 h-0.5 rounded-full bg-maroon-600"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
              </NavLink>
            );
          })}
        </div>

        <div className="flex items-center gap-4">
          {/* The negative margin cancels the padding, so the icon sits
              exactly where it did while the tappable area grows to a
              comfortable size on a phone. */}
          <Link
            to="/cart"
            aria-label={itemCount() > 0 ? `Cart, ${itemCount()} items` : "Cart"}
            className="-m-2 flex items-center p-2 text-maroon-800"
          >
            <span className="relative flex">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 1.973-4.68 2.53-7.126a1.13 1.13 0 00-1.18-1.417H5.106M7.5 14.25L5.106 5.272M6.75 20.25a.375.375 0 100 .75.375.375 0 000-.75zm12 0a.375.375 0 100 .75.375.375 0 000-.75z" />
              </svg>
              <AnimatePresence>
                {itemCount() > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-maroon-600 text-[10px] font-bold text-white"
                  >
                    {itemCount()}
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
          </Link>

          <button
            className="-m-2 p-2 md:hidden text-maroon-800"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
            </svg>
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            id="mobile-menu"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="md:hidden overflow-hidden border-t border-maroon-100 bg-blush-50"
          >
            <div className="flex flex-col gap-3 px-4 py-4">
              {links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  onClick={() => setMenuOpen(false)}
                  className="text-sm font-medium text-maroon-900/80"
                >
                  {link.label}
                </NavLink>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

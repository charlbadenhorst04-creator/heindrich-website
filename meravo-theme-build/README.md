# MERAVO Shopify theme

`meravo-theme/` is the storefront as a Shopify Online Store 2.0 theme: the
same colours, fonts, layout, animations and M mascot, with products, prices,
cart and checkout coming from Shopify. `meravo-theme.zip` at the repository
root is that folder's contents, ready to upload.

This folder holds only what builds the theme's CSS; it is not part of the
theme.

## Install

Shopify admin → **Online Store → Themes → Add theme → Upload zip file** →
choose `meravo-theme.zip` → **Customize**.

## One-time setup in the Shopify admin

| Where | What |
| --- | --- |
| Settings → General → Store currency → Change formatting | HTML with currency / without currency: `R {{amount}}` — prices then read `R 1,199.00`, as on the current site |
| Online Store → Navigation → Main menu | Home, Shop (`/collections/all`), About, Contact. Until the menu has links, the header shows exactly these |
| Online Store → Pages | **About** (handle `about`) with the about text. **Contact** (handle `contact`), template **page.contact** |
| Settings → Policies | Privacy policy, Refund policy, Terms of service — the footer links appear as each is filled in |
| Products → each product | Product type (shown above the name, e.g. "Kids & Toys"), photos, and optionally a video |
| Products → collections | One per category (Tools & Hardware, Automotive, Kids & Toys, Home & Care). They become the pills on the Shop page |
| Settings → Shipping and delivery | R99 Aramex, free over R1,500. The cart's note about this is only words (Customize → Cart) |

### Optional: a product's own "Why you'll love it" list

Settings → Custom data → Products → Add definition: name `Highlights`,
namespace and key `custom.highlights`, type **Single line text, list of
values**. Products with highlights show them; the rest show the three in
Customize → Product.

## What can be changed in the theme editor

- **Homepage:** Hero (eyebrow, heading, text, button, mascot, glow),
  Product showcase and Featured collection (collection, heading, how many),
  Promise banner (one block per promise), plus an **Image banner** section to
  add for sales or new ranges.
- **Theme settings:** fonts; header wordmark; favicon; the background
  artwork (images, strength, breathing on/off); the walking woman (on/off,
  strength); contact phone, WhatsApp number and email; scroll animations.
- **Footer:** brand name, tagline, headings and shipping text. **M**: the
  tips, as blocks, or switched off.

## Rebuilding the CSS

The theme's classes are Tailwind's, compiled into `assets/theme.css`.
After changing classes in any `.liquid` file:

```bash
(cd frontend && npm ci)      # once
bash meravo-theme-build/build.sh
```

`theme.src.css` holds the base styles and every animation (the React site's
Framer Motion, redone in CSS).

## Checking

```bash
npx @shopify/cli theme check --path meravo-theme
```

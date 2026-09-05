export interface ShowcaseProduct {
  id: string;
  name: string;
  price: number;
  imageUrl?: string;
}

// Static, front-end-only data for <ProductShowcase> - no API call involved.
// Add or remove entries here to change what the showcase displays.
export const showcaseProducts: ShowcaseProduct[] = [
  {
    id: "screwdriver-set",
    name: "101-Piece Magnetic Precision Screwdriver Set",
    price: 499.0,
    imageUrl: "https://picsum.photos/seed/101-piece-magnetic-precision-screwdriver-set/600/600",
  },
  {
    id: "car-vacuum-cleaner",
    name: "Car Vacuum Cleaner",
    price: 499.0,
    imageUrl: "https://picsum.photos/seed/car-vacuum-cleaner/600/600",
  },
  {
    id: "plush-lion-puppet",
    name: "Interactive Plush Lion Hand Puppet",
    price: 129.0,
    imageUrl: "https://picsum.photos/seed/interactive-plush-lion-hand-puppet/600/600",
  },
  {
    id: "kids-drawing-tablet",
    name: "Kids Drawing Tablet",
    price: 299.0,
    imageUrl: "https://picsum.photos/seed/kids-drawing-tablet/600/600",
  },
  {
    id: "hobby-horse-unicorn",
    name: "Kids Hobby Horse or Unicorn with Galloping Neighing Sounds",
    price: 349.0,
    imageUrl: "https://picsum.photos/seed/kids-hobby-horse-unicorn-galloping-sounds/600/600",
  },
  {
    id: "mountain-bike-seat",
    name: "Kids Mountain Bike Seat with Dual Handle",
    price: 1199.0,
    imageUrl: "https://picsum.photos/seed/kids-mountain-bike-seat-dual-handle/600/600",
  },
  {
    id: "white-shoe-cleaner",
    name: "White Shoe Cleaner – Restore. Refresh. Shine.",
    price: 92.0,
    imageUrl: "https://picsum.photos/seed/white-shoe-cleaner-restore-refresh-shine/600/600",
  },
];

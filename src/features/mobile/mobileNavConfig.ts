/** Same five tabs as tijar.ng shop (feed variant). */
export const mobileNavConfig = [
  { to: "/shop", labelKey: "shop.nav.home", exact: true },
  { to: "/shop/discover", labelKey: "shop.nav.explore" },
  { to: "/shop/create", labelKey: "shop.nav.sell" },
  { to: "/shop/enquiries", labelKey: "shop.nav.messages" },
  { to: "/shop/profile", labelKey: "shop.nav.profile" },
] as const;

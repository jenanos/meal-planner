"use client";

import { useMemo } from "react";
import { useAuth } from "./AuthGuard";
import ResponsiveNav, { type NavItem } from "./ResponsiveNav";

const BASE_NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Ukesplan" },
  { href: "/recipes", label: "Oppskrifter" },
  { href: "/ingredients", label: "Ingredienser" },
  { href: "/freezer", label: "Fryseren" },
  { href: "/shopping-list", label: "Handleliste" },
  { href: "/settings", label: "Innstillinger" },
];

const ADMIN_NAV_ITEM: NavItem = { href: "/admin", label: "Admin" };

export function DynamicNav() {
  const { user } = useAuth();

  const items = useMemo(() => {
    if (user?.role === "ADMIN") {
      return [...BASE_NAV_ITEMS, ADMIN_NAV_ITEM];
    }
    return BASE_NAV_ITEMS;
  }, [user?.role]);

  return <ResponsiveNav items={items} />;
}

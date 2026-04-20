"use client";

import { useMemo } from "react";
import {
  CalendarDays,
  ShoppingCart,
  BookOpen,
  Carrot,
  Snowflake,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "./AuthGuard";
import ResponsiveNav, { type NavItem } from "./ResponsiveNav";

const BASE_NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Ukesplan", icon: CalendarDays, primary: true },
  { href: "/shopping-list", label: "Handleliste", icon: ShoppingCart, primary: true },
  { href: "/recipes", label: "Oppskrifter", icon: BookOpen, primary: true },
  { href: "/ingredients", label: "Ingredienser", icon: Carrot },
  { href: "/freezer", label: "Fryseren", icon: Snowflake },
  { href: "/settings", label: "Innstillinger", icon: Settings },
];

const ADMIN_NAV_ITEM: NavItem = {
  href: "/admin",
  label: "Admin",
  icon: ShieldCheck,
};

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

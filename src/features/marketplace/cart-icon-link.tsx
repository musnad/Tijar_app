import { Link } from "@tanstack/react-router";
import { ShoppingCart } from "lucide-react";

import { cn } from "@/lib/utils";

export function CartIconLink({
  count,
  className,
  native = false,
}: {
  count: number;
  className?: string;
  native?: boolean;
}) {
  return (
    <Link
      to="/shop/cart"
      aria-label={count > 0 ? `Cart, ${count} items` : "Cart"}
      className={cn(
        "relative flex items-center justify-center text-foreground",
        native
          ? "size-10 rounded-full bg-white/90 shadow-[0_4px_14px_rgba(11,31,58,0.08)]"
          : "size-11 min-h-11 min-w-11 rounded-full",
        className,
      )}
    >
      <ShoppingCart className="size-5" strokeWidth={2} />
      {count > 0 ? (
        <span className="absolute right-0.5 top-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-extrabold leading-4 text-white">
          {count > 9 ? "9+" : count}
        </span>
      ) : null}
    </Link>
  );
}

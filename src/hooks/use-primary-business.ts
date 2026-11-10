"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { ACTIVE_SHOP_EVENT, readActiveShopId } from "@/lib/active-business";
import { fetchPrimaryBusiness } from "@/services/business-service";

export function usePrimaryBusiness(profileId: string | undefined) {
  const [activeId, setActiveId] = useState(() => readActiveShopId(profileId));

  useEffect(() => {
    setActiveId(readActiveShopId(profileId));
    function sync() {
      setActiveId(readActiveShopId(profileId));
    }
    window.addEventListener(ACTIVE_SHOP_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(ACTIVE_SHOP_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [profileId]);

  return useQuery({
    queryKey: ["primary-business", profileId, activeId],
    enabled: Boolean(profileId),
    queryFn: async () => {
      if (!profileId) return { business: null, dna: null, canPost: false };
      const result = await fetchPrimaryBusiness(profileId);
      if (result.error && !result.business) return { business: null, dna: null, canPost: false };
      return { business: result.business, dna: result.dna, canPost: result.canPost };
    },
  });
}

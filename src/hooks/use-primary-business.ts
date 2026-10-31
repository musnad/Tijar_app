"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchPrimaryBusiness } from "@/services/business-service";

export function usePrimaryBusiness(profileId: string | undefined) {
  return useQuery({
    queryKey: ["primary-business", profileId],
    enabled: Boolean(profileId),
    queryFn: async () => {
      if (!profileId) return { business: null, dna: null };
      const result = await fetchPrimaryBusiness(profileId);
      if (result.error) return { business: null, dna: null };
      return { business: result.business, dna: result.dna };
    },
  });
}

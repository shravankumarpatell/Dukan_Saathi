"use client";

import { useCallback } from "react";
import { useAppHistory } from "@/context/AppHistoryContext";

/** Drop-in for react-router's useNavigate — pushes path strings without a Next remount. */
export function useNavigate() {
  const { navigate } = useAppHistory();
  return useCallback((to, opts) => navigate(to, opts), [navigate]);
}

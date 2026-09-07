import axios from "axios";

// Surfaces the API's own message (e.g. "Only 3 of X left in stock")
// rather than a generic failure, falling back when there isn't one.
export function errorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string" && detail.trim()) return detail;
  }
  return fallback;
}

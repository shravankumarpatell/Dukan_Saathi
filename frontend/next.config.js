const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  eslint: { ignoreDuringBuilds: true },
  // Existing .env may still use CRA prefixes; expose them as NEXT_PUBLIC_*.
  env: {
    NEXT_PUBLIC_API_URL:
      process.env.NEXT_PUBLIC_API_URL ||
      process.env.REACT_APP_API_URL ||
      "http://localhost:8000/api",
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.REACT_APP_SUPABASE_URL ||
      "",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.REACT_APP_SUPABASE_PUBLISHABLE_KEY ||
      process.env.REACT_APP_SUPABASE_ANON_KEY ||
      "",
  },
  webpack: (config) => {
    config.resolve.alias["@"] = path.resolve(__dirname, "src");
    return config;
  },
};

module.exports = nextConfig;

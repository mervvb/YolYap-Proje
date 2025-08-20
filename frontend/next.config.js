const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_MAPBOX_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
    MAPBOX_SERVER_TOKEN: process.env.MAPBOX_SERVER_TOKEN,
  },
};
export default nextConfig;
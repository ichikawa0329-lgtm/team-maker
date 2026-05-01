/** @type {import('next').NextConfig} */
const nextConfig = {
  // スマホからローカル IP で開けるように許可
  allowedDevOrigins: ["192.168.0.16", "localhost"],
};

export default nextConfig;

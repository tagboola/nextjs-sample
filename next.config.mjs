/** @type {import('next').NextConfig} */
const nextConfig = {
    experimental: {
        serverComponentsExternalPackages: ['google-proto-files'],
        instrumentationHook: true,
    },
}

export default nextConfig;

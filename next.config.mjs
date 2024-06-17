/** @type {import('next').NextConfig} */
const nextConfig = {
    experimental: {
        serverComponentsExternalPackages: ['google-proto-files'],
    },
}

export default nextConfig;

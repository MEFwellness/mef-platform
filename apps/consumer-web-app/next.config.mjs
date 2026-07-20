/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { typedRoutes: true },
  async redirects() {
    return [
      // The CHEK Practitioner questionnaire's member-facing URL was renamed to
      // drop CHEK/HLC1 branding (see lib/assessments/publicSlug.ts) — its
      // stable internal id/DB key is unchanged, only this URL moved. Two
      // entries so both the bare overview path and every nested path
      // (take/results/history/category) redirect correctly.
      {
        source: '/assessments/chek-hlc1-nutrition-lifestyle',
        destination: '/assessments/nutrition-lifestyle',
        permanent: true,
      },
      {
        source: '/assessments/chek-hlc1-nutrition-lifestyle/:path*',
        destination: '/assessments/nutrition-lifestyle/:path*',
        permanent: true,
      },
    ];
  },
};
export default nextConfig;

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "MMF Studio",
    short_name: "MMF Studio",
    description:
      "Private investment projections and financial freedom planning, available offline.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f7f8f3",
    theme_color: "#315943",
    lang: "en",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    prefer_related_applications: false,
  };
}

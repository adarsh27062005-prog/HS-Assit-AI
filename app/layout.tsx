import type { Metadata } from "next";
import "./globals.css";
import ShaderBackground from "@/components/webgl/ShaderBackground";
import SmoothScroll from "@/components/SmoothScroll";
import CustomCursor from "@/components/CustomCursor";

export const metadata: Metadata = {
  title: "Anomaly Intelligence — Loyalty Data Checker",
  description:
    "AI-powered data quality checks for Mapping_id_Calc_of_points_OL, with precise cell-level anomaly detection and a RAG assistant.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <ShaderBackground />
        <SmoothScroll />
        <CustomCursor />
        {children}
      </body>
    </html>
  );
}

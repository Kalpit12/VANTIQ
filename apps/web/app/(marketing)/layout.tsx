import type { Metadata } from "next";
import { Instrument_Serif } from "next/font/google";
import "./landing.css";

const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Vantiq Finance · Every dollar, traced to the molecule",
  description:
    "Finance review for pharma and biotech. Budget versus actual by program and trial phase, CRO spend you can trace, and a runway your board will believe.",
};

// Lets CSS hide scroll-in content only when scripts run, so the page still reads without them.
const jsFlag = `document.documentElement.classList.add("lp-js")`;

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`lp ${serif.variable}`}>
      <script dangerouslySetInnerHTML={{ __html: jsFlag }} />
      {children}
    </div>
  );
}

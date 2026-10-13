import type { Metadata } from "next";
import "./landing.css";

export const metadata: Metadata = {
  title: "Vantiq Finance · Every dollar, traced to the molecule",
  description:
    "The finance review built only for pharma and biotech. Budget versus actual by program and trial phase, CRO spend traced to the invoice, and a runway your board will believe.",
};

// Lets CSS hide scroll-in content only when scripts run, so the page still reads without them.
const jsFlag = `document.documentElement.classList.add("lp-js")`;

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="lp">
      <script dangerouslySetInnerHTML={{ __html: jsFlag }} />
      {children}
    </div>
  );
}

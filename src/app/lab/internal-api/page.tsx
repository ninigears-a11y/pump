import type { Metadata } from "next";
import { InternalApiLab } from "./Lab";

export const metadata: Metadata = {
  title: "Lab · Internal lookup experiment",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <InternalApiLab />;
}
